import { Request, Response, NextFunction } from "express";
import { eq, and, lt, inArray, sql } from "drizzle-orm";
import { sites } from "@server/db";
import { db } from "@server/db";
import logger from "@server/logger";
import createHttpError from "http-errors";
import HttpCode from "@server/types/HttpCode";
import response from "@server/lib/response";
import { usageService } from "@server/lib/billing/usageService";
import { FeatureId } from "@server/lib/billing/features";
import { checkExitNodeOrg } from "#dynamic/lib/exitNodes";
import { build } from "@server/build";

// Track sites that are already offline to avoid unnecessary queries
const offlineSites = new Set<string>();

// Retry configuration for deadlock handling
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 50;

interface PeerBandwidth {
    publicKey: string;
    bytesIn: number;
    bytesOut: number;
}

/**
 * Check if an error is a deadlock error
 */
function isDeadlockError(error: any): boolean {
    return (
        error?.code === "40P01" ||
        error?.cause?.code === "40P01" ||
        (error?.message && error.message.includes("deadlock"))
    );
}

/**
 * Execute a function with retry logic for deadlock handling
 */
async function withDeadlockRetry<T>(
    operation: () => Promise<T>,
    context: string
): Promise<T> {
    let attempt = 0;
    while (true) {
        try {
            return await operation();
        } catch (error: any) {
            if (isDeadlockError(error) && attempt < MAX_RETRIES) {
                attempt++;
                const baseDelay = Math.pow(2, attempt - 1) * BASE_DELAY_MS;
                const jitter = Math.random() * baseDelay;
                const delay = baseDelay + jitter;
                logger.warn(
                    `Deadlock detected in ${context}, retrying attempt ${attempt}/${MAX_RETRIES} after ${delay.toFixed(0)}ms`
                );
                await new Promise((resolve) => setTimeout(resolve, delay));
                continue;
            }
            throw error;
        }
    }
}

export const receiveBandwidth = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> => {
    try {
        const bandwidthData: PeerBandwidth[] = req.body;

        if (!Array.isArray(bandwidthData)) {
            throw new Error("Invalid bandwidth data");
        }

        await updateSiteBandwidth(bandwidthData, build == "saas"); // we are checking the usage on saas only

        return response(res, {
            data: {},
            success: true,
            error: false,
            message: "Bandwidth data updated successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error("Error updating bandwidth data:", error);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "An error occurred..."
            )
        );
    }
};

export async function updateSiteBandwidth(
    bandwidthData: PeerBandwidth[],
    calcUsageAndLimits: boolean,
    exitNodeId?: number
) {
    const currentTime = new Date();
    const oneMinuteAgo = new Date(currentTime.getTime() - 60000); // 1 minute ago

    // Sort bandwidth data by publicKey to ensure consistent lock ordering across all instances
    // This is critical for preventing deadlocks when multiple instances update the same sites
    const sortedBandwidthData = [...bandwidthData].sort((a, b) =>
        a.publicKey.localeCompare(b.publicKey)
    );

    // First, handle sites that are actively reporting bandwidth
    const activePeers = sortedBandwidthData.filter((peer) => peer.bytesIn > 0);

    // Aggregate usage data by organization (collected outside transaction)
    const orgUsageMap = new Map<string, number>();

    if (activePeers.length > 0) {
        // Remove any active peers from offline tracking since they're sending data
        activePeers.forEach((peer) => offlineSites.delete(peer.publicKey));

        // Update each active site individually with retry logic
        // This reduces transaction scope and allows retries per-site
        for (const peer of activePeers) {
            try {
                const updatedSite = await withDeadlockRetry(async () => {
                    const [result] = await db
                        .update(sites)
                        .set({
                            megabytesOut: sql`${sites.megabytesOut} + ${peer.bytesIn}`,
                            megabytesIn: sql`${sites.megabytesIn} + ${peer.bytesOut}`,
                            lastBandwidthUpdate: currentTime.toISOString(),
                            online: true
                        })
                        .where(eq(sites.pubKey, peer.publicKey))
                        .returning({
                            online: sites.online,
                            orgId: sites.orgId,
                            siteId: sites.siteId,
                            lastBandwidthUpdate: sites.lastBandwidthUpdate
                        });
                    return result;
                }, `update active site ${peer.publicKey}`);

                if (updatedSite) {
                    if (exitNodeId) {
                        const notAllowed = await checkExitNodeOrg(
                            exitNodeId,
                            updatedSite.orgId
                        );
                        if (notAllowed) {
                            logger.warn(
                                `Exit node ${exitNodeId} is not allowed for org ${updatedSite.orgId}`
                            );
                            // Skip this site but continue processing others
                            continue;
                        }
                    }

                    // Aggregate bandwidth usage for the org
                    const totalBandwidth = peer.bytesIn + peer.bytesOut;
                    const currentOrgUsage =
                        orgUsageMap.get(updatedSite.orgId) || 0;
                    orgUsageMap.set(
                        updatedSite.orgId,
                        currentOrgUsage + totalBandwidth
                    );
                }
            } catch (error) {
                logger.error(
                    `Failed to update bandwidth for site ${peer.publicKey}:`,
                    error
                );
                // Continue with other sites
            }
        }
    }

    // Process usage updates outside of site update transactions
    // This separates the concerns and reduces lock contention
    if (calcUsageAndLimits && orgUsageMap.size > 0) {
        // Sort org IDs to ensure consistent lock ordering
        const allOrgIds = [...new Set([...orgUsageMap.keys()])].sort();

        for (const orgId of allOrgIds) {
            try {
                // Process bandwidth usage for this org
                const totalBandwidth = orgUsageMap.get(orgId);
                if (totalBandwidth) {
                    const bandwidthUsage = await usageService.add(
                        orgId,
                        FeatureId.EGRESS_DATA_MB,
                        totalBandwidth
                    );
                    if (bandwidthUsage) {
                        // Fire and forget - don't block on limit checking
                        usageService
                            .checkLimitSet(
                                orgId,

                                FeatureId.EGRESS_DATA_MB,
                                bandwidthUsage
                            )
                            .catch((error: any) => {
                                logger.error(
                                    `Error checking bandwidth limits for org ${orgId}:`,
                                    error
                                );
                            });
                    }
                }
            } catch (error) {
                logger.error(`Error processing usage for org ${orgId}:`, error);
                // Continue with other orgs
            }
        }
    }

    // Handle sites that reported zero bandwidth but need online status updated
    const zeroBandwidthPeers = sortedBandwidthData.filter(
        (peer) => peer.bytesIn === 0 && !offlineSites.has(peer.publicKey)
    );

    if (zeroBandwidthPeers.length > 0) {
        // Fetch all zero bandwidth sites in one query
        const zeroBandwidthSites = await db
            .select()
            .from(sites)
            .where(
                inArray(
                    sites.pubKey,
                    zeroBandwidthPeers.map((p) => p.publicKey)
                )
            );

        // Sort by siteId to ensure consistent lock ordering
        const sortedZeroBandwidthSites = zeroBandwidthSites.sort(
            (a, b) => a.siteId - b.siteId
        );

        for (const site of sortedZeroBandwidthSites) {
            let newOnlineStatus = site.online;

            // Check if site should go offline based on last bandwidth update WITH DATA
            if (site.lastBandwidthUpdate) {
                const lastUpdateWithData = new Date(site.lastBandwidthUpdate);
                if (lastUpdateWithData < oneMinuteAgo) {
                    newOnlineStatus = false;
                }
            } else {
                // No previous data update recorded, set to offline
                newOnlineStatus = false;
            }

            // Only update online status if it changed
            if (site.online !== newOnlineStatus) {
                try {
                    const updatedSite = await withDeadlockRetry(async () => {
                        const [result] = await db
                            .update(sites)
                            .set({
                                online: newOnlineStatus
                            })
                            .where(eq(sites.siteId, site.siteId))
                            .returning();
                        return result;
                    }, `update offline status for site ${site.siteId}`);

                    if (updatedSite && exitNodeId) {
                        const notAllowed = await checkExitNodeOrg(
                            exitNodeId,
                            updatedSite.orgId
                        );
                        if (notAllowed) {
                            logger.warn(
                                `Exit node ${exitNodeId} is not allowed for org ${updatedSite.orgId}`
                            );
                        }
                    }

                    // If site went offline, add it to our tracking set
                    if (!newOnlineStatus && site.pubKey) {
                        offlineSites.add(site.pubKey);
                    }
                } catch (error) {
                    logger.error(
                        `Failed to update offline status for site ${site.siteId}:`,
                        error
                    );
                    // Continue with other sites
                }
            }
        }
    }
}
