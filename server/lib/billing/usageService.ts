import { eq, sql, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import {
    db,
    usage,
    customers,
    sites,
    newts,
    limits,
    Usage,
    Limit,
    Transaction
} from "@server/db";
import { FeatureId, getFeatureMeterId } from "./features";
import logger from "@server/logger";
import { sendToClient } from "#dynamic/routers/ws";
import { build } from "@server/build";
import { s3Client } from "@server/lib/s3";
import cache from "@server/lib/cache";

interface StripeEvent {
    identifier?: string;
    timestamp: number;
    event_name: string;
    payload: {
        value: number;
        stripe_customer_id: string;
    };
}

export function noop() {
    if (build !== "saas") {
        return true;
    }
    return false;
}

export class UsageService {
    private bucketName: string | undefined;
    private events: StripeEvent[] = [];
    private lastUploadTime: number = Date.now();
    private isUploading: boolean = false;

    constructor() {
        if (noop()) {
            return;
        }

        // this.bucketName = process.env.S3_BUCKET || undefined;

        // // Periodically check and upload events
        // setInterval(() => {
        //     this.checkAndUploadEvents().catch((err) => {
        //         logger.error("Error in periodic event upload:", err);
        //     });
        // }, 30000); // every 30 seconds

        // // Handle graceful shutdown on SIGTERM
        // process.on("SIGTERM", async () => {
        //     logger.info(
        //         "SIGTERM received, uploading events before shutdown..."
        //     );
        //     await this.forceUpload();
        //     logger.info("Events uploaded, proceeding with shutdown");
        // });

        // // Handle SIGINT as well (Ctrl+C)
        // process.on("SIGINT", async () => {
        //     logger.info("SIGINT received, uploading events before shutdown...");
        //     await this.forceUpload();
        //     logger.info("Events uploaded, proceeding with shutdown");
        //     process.exit(0);
        // });
    }

    /**
     * Truncate a number to 11 decimal places to prevent precision issues
     */
    private truncateValue(value: number): number {
        return Math.round(value * 100000000000) / 100000000000; // 11 decimal places
    }

    public async add(
        orgId: string,
        featureId: FeatureId,
        value: number,
        transaction: any = null
    ): Promise<Usage | null> {
        if (noop()) {
            return null;
        }

        // Truncate value to 11 decimal places
        value = this.truncateValue(value);

        // Implement retry logic for deadlock handling
        const maxRetries = 3;
        let attempt = 0;

        while (attempt <= maxRetries) {
            try {
                // Get subscription data for this org (with caching)
                const customerId = await this.getCustomerId(orgId, featureId);

                if (!customerId) {
                    logger.warn(
                        `No subscription data found for org ${orgId} and feature ${featureId}`
                    );
                    return null;
                }

                let usage;
                if (transaction) {
                    usage = await this.internalAddUsage(
                        orgId,
                        featureId,
                        value,
                        transaction
                    );
                } else {
                    await db.transaction(async (trx) => {
                        usage = await this.internalAddUsage(
                            orgId,
                            featureId,
                            value,
                            trx
                        );
                    });
                }

                // Log event for Stripe
                // if (privateConfig.getRawPrivateConfig().flags.usage_reporting) {
                //     await this.logStripeEvent(featureId, value, customerId);
                // }

                return usage || null;
            } catch (error: any) {
                // Check if this is a deadlock error
                const isDeadlock =
                    error?.code === "40P01" ||
                    error?.cause?.code === "40P01" ||
                    (error?.message && error.message.includes("deadlock"));

                if (isDeadlock && attempt < maxRetries) {
                    attempt++;
                    // Exponential backoff with jitter: 50-150ms, 100-300ms, 200-600ms
                    const baseDelay = Math.pow(2, attempt - 1) * 50;
                    const jitter = Math.random() * baseDelay;
                    const delay = baseDelay + jitter;

                    logger.warn(
                        `Deadlock detected for ${orgId}/${featureId}, retrying attempt ${attempt}/${maxRetries} after ${delay.toFixed(0)}ms`
                    );

                    await new Promise((resolve) => setTimeout(resolve, delay));
                    continue;
                }

                logger.error(
                    `Failed to add usage for ${orgId}/${featureId} after ${attempt} attempts:`,
                    error
                );
                break;
            }
        }

        return null;
    }

    private async internalAddUsage(
        orgId: string,
        featureId: FeatureId,
        value: number,
        trx: Transaction
    ): Promise<Usage> {
        // Truncate value to 11 decimal places
        value = this.truncateValue(value);

        const usageId = `${orgId}-${featureId}`;
        const meterId = getFeatureMeterId(featureId);

        // Use upsert: insert if not exists, otherwise increment
        const [returnUsage] = await trx
            .insert(usage)
            .values({
                usageId,
                featureId,
                orgId,
                meterId,
                latestValue: value,
                updatedAt: Math.floor(Date.now() / 1000)
            })
            .onConflictDoUpdate({
                target: usage.usageId,
                set: {
                    latestValue: sql`${usage.latestValue} + ${value}`
                }
            })
            .returning();

        return returnUsage;
    }

    // Helper function to get today's date as string (YYYY-MM-DD)
    getTodayDateString(): string {
        return new Date().toISOString().split("T")[0];
    }

    // Helper function to get date string from Date object
    getDateString(date: number): string {
        return new Date(date * 1000).toISOString().split("T")[0];
    }

    async updateCount(
        orgId: string,
        featureId: FeatureId,
        value?: number,
        customerId?: string
    ): Promise<void> {
        if (noop()) {
            return;
        }
        try {
            if (!customerId) {
                customerId =
                    (await this.getCustomerId(orgId, featureId)) || undefined;
                if (!customerId) {
                    logger.warn(
                        `No subscription data found for org ${orgId} and feature ${featureId}`
                    );
                    return;
                }
            }

            // Truncate value to 11 decimal places if provided
            if (value !== undefined && value !== null) {
                value = this.truncateValue(value);
            }

            let currentUsage: Usage | null = null;

            await db.transaction(async (trx) => {
                // Get existing meter record
                const usageId = `${orgId}-${featureId}`;
                // Get current usage record
                [currentUsage] = await trx
                    .select()
                    .from(usage)
                    .where(eq(usage.usageId, usageId))
                    .limit(1);

                if (currentUsage) {
                    await trx
                        .update(usage)
                        .set({
                            instantaneousValue: value,
                            updatedAt: Math.floor(Date.now() / 1000)
                        })
                        .where(eq(usage.usageId, usageId));
                } else {
                    // First record for this meter
                    const meterId = getFeatureMeterId(featureId);
                    await trx.insert(usage).values({
                        usageId,
                        featureId,
                        orgId,
                        meterId,
                        instantaneousValue: value || 0,
                        latestValue: value || 0,
                        updatedAt: Math.floor(Date.now() / 1000)
                    });
                }
            });

            // if (privateConfig.getRawPrivateConfig().flags.usage_reporting) {
            //     await this.logStripeEvent(featureId, value || 0, customerId);
            // }
        } catch (error) {
            logger.error(
                `Failed to update count usage for ${orgId}/${featureId}:`,
                error
            );
        }
    }

    private async getCustomerId(
        orgId: string,
        featureId: FeatureId
    ): Promise<string | null> {
        const cacheKey = `customer_${orgId}_${featureId}`;
        const cached = cache.get<string>(cacheKey);

        if (cached) {
            return cached;
        }

        try {
            // Query subscription data
            const [customer] = await db
                .select({
                    customerId: customers.customerId
                })
                .from(customers)
                .where(eq(customers.orgId, orgId))
                .limit(1);

            if (!customer) {
                return null;
            }

            const customerId = customer.customerId;

            // Cache the result
            cache.set(cacheKey, customerId, 300); // 5 minute TTL

            return customerId;
        } catch (error) {
            logger.error(
                `Failed to get subscription data for ${orgId}/${featureId}:`,
                error
            );
            return null;
        }
    }

    private async logStripeEvent(
        featureId: FeatureId,
        value: number,
        customerId: string
    ): Promise<void> {
        // Truncate value to 11 decimal places before sending to Stripe
        const truncatedValue = this.truncateValue(value);

        const event: StripeEvent = {
            identifier: uuidv4(),
            timestamp: Math.floor(new Date().getTime() / 1000),
            event_name: featureId,
            payload: {
                value: truncatedValue,
                stripe_customer_id: customerId
            }
        };

        this.addEventToMemory(event);
        await this.checkAndUploadEvents();
    }

    private addEventToMemory(event: StripeEvent): void {
        if (!this.bucketName) {
            logger.warn(
                "S3 bucket name is not configured, skipping event storage."
            );
            return;
        }
        this.events.push(event);
    }

    private async checkAndUploadEvents(): Promise<void> {
        const now = Date.now();
        const timeSinceLastUpload = now - this.lastUploadTime;

        // Check if at least 1 minute has passed since last upload
        if (timeSinceLastUpload >= 60000 && this.events.length > 0) {
            await this.uploadEventsToS3();
        }
    }

    private async uploadEventsToS3(): Promise<void> {
        if (!this.bucketName) {
            logger.warn(
                "S3 bucket name is not configured, skipping S3 upload."
            );
            return;
        }

        if (this.events.length === 0) {
            return;
        }

        // Check if already uploading
        if (this.isUploading) {
            logger.debug("Already uploading events, skipping");
            return;
        }

        this.isUploading = true;

        try {
            // Take a snapshot of current events and clear the array
            const eventsToUpload = [...this.events];
            this.events = [];
            this.lastUploadTime = Date.now();

            const fileName = this.generateEventFileName();
            const fileContent = JSON.stringify(eventsToUpload, null, 2);

            // Upload to S3
            const uploadCommand = new PutObjectCommand({
                Bucket: this.bucketName,
                Key: fileName,
                Body: fileContent,
                ContentType: "application/json"
            });

            await s3Client.send(uploadCommand);

            logger.info(
                `Uploaded ${fileName} to S3 with ${eventsToUpload.length} events`
            );
        } catch (error) {
            logger.error("Failed to upload events to S3:", error);
            // Note: Events are lost if upload fails. In a production system,
            // you might want to add the events back to the array or implement retry logic
        } finally {
            this.isUploading = false;
        }
    }

    private generateEventFileName(): string {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const uuid = uuidv4().substring(0, 8);
        return `events-${timestamp}-${uuid}.json`;
    }

    public async getUsage(
        orgId: string,
        featureId: FeatureId,
        trx: Transaction | typeof db = db
    ): Promise<Usage | null> {
        if (noop()) {
            return null;
        }

        const usageId = `${orgId}-${featureId}`;

        try {
            const [result] = await trx
                .select()
                .from(usage)
                .where(eq(usage.usageId, usageId))
                .limit(1);

            if (!result) {
                // Lets create one if it doesn't exist using upsert to handle race conditions
                logger.info(
                    `Creating new usage record for ${orgId}/${featureId}`
                );
                const meterId = getFeatureMeterId(featureId);

                try {
                    const [newUsage] = await trx
                        .insert(usage)
                        .values({
                            usageId,
                            featureId,
                            orgId,
                            meterId,
                            latestValue: 0,
                            updatedAt: Math.floor(Date.now() / 1000)
                        })
                        .onConflictDoNothing()
                        .returning();

                    if (newUsage) {
                        return newUsage;
                    } else {
                        // Record was created by another process, fetch it
                        const [existingUsage] = await trx
                            .select()
                            .from(usage)
                            .where(eq(usage.usageId, usageId))
                            .limit(1);
                        return existingUsage || null;
                    }
                } catch (insertError) {
                    // Fallback: try to fetch existing record in case of any insert issues
                    logger.warn(
                        `Insert failed for ${orgId}/${featureId}, attempting to fetch existing record:`,
                        insertError
                    );
                    const [existingUsage] = await trx
                        .select()
                        .from(usage)
                        .where(eq(usage.usageId, usageId))
                        .limit(1);
                    return existingUsage || null;
                }
            }

            return result;
        } catch (error) {
            logger.error(
                `Failed to get usage for ${orgId}/${featureId}:`,
                error
            );
            throw error;
        }
    }

    public async forceUpload(): Promise<void> {
        if (this.events.length > 0) {
            // Force upload regardless of time
            this.lastUploadTime = 0; // Reset to force upload
            await this.uploadEventsToS3();
        }
    }

    public async checkLimitSet(
        orgId: string,
        featureId?: FeatureId,
        usage?: Usage,
        trx: Transaction | typeof db = db
    ): Promise<boolean> {
        if (noop()) {
            return false;
        }
        // This method should check the current usage against the limits set for the organization
        // and kick out all of the sites on the org
        let hasExceededLimits = false;

        try {
            let orgLimits: Limit[] = [];
            if (featureId) {
                // Get all limits set for this organization
                orgLimits = await trx
                    .select()
                    .from(limits)
                    .where(
                        and(
                            eq(limits.orgId, orgId),
                            eq(limits.featureId, featureId)
                        )
                    );
            } else {
                // Get all limits set for this organization
                orgLimits = await trx
                    .select()
                    .from(limits)
                    .where(eq(limits.orgId, orgId));
            }

            if (orgLimits.length === 0) {
                logger.debug(`No limits set for org ${orgId}`);
                return false;
            }

            // Check each limit against current usage
            for (const limit of orgLimits) {
                let currentUsage: Usage | null;
                if (usage) {
                    currentUsage = usage;
                } else {
                    currentUsage = await this.getUsage(
                        orgId,
                        limit.featureId as FeatureId,
                        trx
                    );
                }

                const usageValue =
                    currentUsage?.instantaneousValue ||
                    currentUsage?.latestValue ||
                    0;
                logger.debug(
                    `Current usage for org ${orgId} on feature ${limit.featureId}: ${usageValue}`
                );
                logger.debug(
                    `Limit for org ${orgId} on feature ${limit.featureId}: ${limit.value}`
                );
                if (
                    currentUsage &&
                    limit.value !== null &&
                    usageValue > limit.value
                ) {
                    logger.debug(
                        `Org ${orgId} has exceeded limit for ${limit.featureId}: ` +
                            `${usageValue} > ${limit.value}`
                    );
                    hasExceededLimits = true;
                    break; // Exit early if any limit is exceeded
                }
            }
        } catch (error) {
            logger.error(`Error checking limits for org ${orgId}:`, error);
        }

        return hasExceededLimits;
    }
}

export const usageService = new UsageService();
