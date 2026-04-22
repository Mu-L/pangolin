import {
    db,
    targets,
    resources,
    sites,
    targetHealthCheck,
    statusHistory
} from "@server/db";
import { MessageHandler } from "@server/routers/ws";
import { Newt } from "@server/db";
import { eq, and, ne } from "drizzle-orm";
import logger from "@server/logger";
import {
    fireHealthCheckHealthyAlert,
    fireHealthCheckUnhealthyAlert
} from "#dynamic/lib/alerts";
import {
    fireResourceHealthyAlert,
    fireResourceUnhealthyAlert
} from "#dynamic/lib/alerts";

interface TargetHealthStatus {
    status: string;
    lastCheck: string;
    checkCount: number;
    lastError?: string;
    config: {
        id: string; // this could be the hc id or the target id, depending on the version of newt
        hcEnabled: boolean;
        hcPath?: string;
        hcScheme?: string;
        hcMode?: string;
        hcHostname?: string;
        hcPort?: number;
        hcInterval?: number;
        hcUnhealthyInterval?: number;
        hcTimeout?: number;
        hcHeaders?: any;
        hcFollowRedirects?: boolean;
        hcMethod?: string;
        hcTlsServerName?: string;
        hcHealthyThreshold?: number;
        hcUnhealthyThreshold?: number;
    };
}

interface HealthcheckStatusMessage {
    targets: Record<string, TargetHealthStatus>;
}

export const handleHealthcheckStatusMessage: MessageHandler = async (
    context
) => {
    const { message, client: c } = context;
    const newt = c as Newt;

    logger.info("Handling healthcheck status message");

    if (!newt) {
        logger.warn("Newt not found");
        return;
    }

    if (!newt.siteId) {
        logger.warn("Newt has no site ID");
        return;
    }

    const data = message.data as HealthcheckStatusMessage;

    if (!data.targets) {
        logger.warn("No targets data in healthcheck status message");
        return;
    }

    try {
        let successCount = 0;
        let errorCount = 0;

        // Process each target status update
        for (const [targetId, healthStatus] of Object.entries(data.targets)) {
            logger.debug(
                `Processing health status for target ${targetId}: ${healthStatus.status}${healthStatus.lastError ? ` (${healthStatus.lastError})` : ""}`
            );

            // Verify the target belongs to this newt's site before updating
            // This prevents unauthorized updates to targets from other sites
            const targetIdNum = parseInt(targetId);
            if (isNaN(targetIdNum)) {
                logger.warn(`Invalid target ID: ${targetId}`);
                errorCount++;
                continue;
            }

            const [targetCheck] = await db
                .select({
                    targetId: targets.targetId,
                    siteId: targets.siteId,
                    orgId: targetHealthCheck.orgId,
                    targetHealthCheckId: targetHealthCheck.targetHealthCheckId,
                    resourceOrgId: resources.orgId,
                    resourceId: resources.resourceId,
                    resourceName: resources.name,
                    name: targetHealthCheck.name,
                    hcHealth: targetHealthCheck.hcHealth
                })
                .from(targetHealthCheck)
                .innerJoin(sites, eq(targetHealthCheck.siteId, sites.siteId))
                .innerJoin(
                    targets,
                    eq(targetHealthCheck.targetId, targets.targetId)
                )
                .innerJoin(
                    resources,
                    eq(targets.resourceId, resources.resourceId)
                )
                .where(
                    and(
                        eq(targetHealthCheck.targetHealthCheckId, targetIdNum),
                        eq(sites.siteId, newt.siteId)
                    )
                )
                .limit(1);

            if (!targetCheck) {
                logger.warn(
                    `Target ${targetId} not found or does not belong to site ${newt.siteId}`
                );
                errorCount++;
                continue;
            }

            // check if the status has changed
            if (targetCheck.hcHealth === healthStatus.status) {
                logger.debug(
                    `Health status for target ${targetId} is already ${healthStatus.status}, skipping update`
                );
                continue;
            }

            // Update the target's health status in the database
            await db
                .update(targetHealthCheck)
                .set({
                    hcHealth: healthStatus.status as
                        | "unknown"
                        | "healthy"
                        | "unhealthy"
                })
                .where(eq(targetHealthCheck.targetId, targetCheck.targetId));

            const orgId = targetCheck.orgId || targetCheck.resourceOrgId; // for backwards compatibility, check both orgId fields because the target health checks dont have the orgId
            if (!orgId) {
                logger.warn(
                    `No org ID found for target ${targetId}, skipping status history logging`
                );
                continue;
            }

            // Log the state change to status history
            await db.insert(statusHistory).values({
                entityType: "healthCheck",
                entityId: targetCheck.targetHealthCheckId,
                orgId: orgId,
                status: healthStatus.status,
                timestamp: Math.floor(Date.now() / 1000)
            });

            if (targetCheck.resourceId) {
                // Log the state change to status history for the resource as well
                // so we can show the resource status along with the site

                // if the status is healthy we should check if ALL of the targets on the resource are currently healthy and if not then dont mark the resource as healthy yet, we want to wait until all targets are healthy to mark the resource as healthy
                let status = healthStatus.status;
                if (healthStatus.status === "healthy") {
                    const otherTargets = await db
                        .select({ hcHealth: targetHealthCheck.hcHealth })
                        .from(targets)
                        .innerJoin(
                            targetHealthCheck,
                            eq(targets.targetId, targetHealthCheck.targetId)
                        )
                        .where(
                            and(
                                eq(targets.resourceId, targetCheck.resourceId),
                                ne(targets.targetId, targetCheck.targetId) // only check the other targets, not the one we just updated
                            )
                        );

                    const allHealthy = otherTargets.every(
                        (t) => t.hcHealth === "healthy"
                    );
                    if (!allHealthy) {
                        logger.debug(
                            `Not marking resource ${targetCheck.resourceId} as healthy because not all targets are healthy`
                        );
                        status = "unhealthy";
                    }
                }

                await db.insert(statusHistory).values({
                    entityType: "resource",
                    entityId: targetCheck.resourceId,
                    orgId: orgId,
                    status: status,
                    timestamp: Math.floor(Date.now() / 1000)
                });

                if (status === "unhealthy") {
                    await fireResourceUnhealthyAlert(
                        orgId,
                        targetCheck.resourceId,
                        targetCheck.resourceName
                    );
                } else if (status === "healthy") {
                    await fireResourceHealthyAlert(
                        orgId,
                        targetCheck.resourceId,
                        targetCheck.resourceName
                    );
                }
            }

            // because we are checking above if there was a change we can fire the alert here because it changed
            if (healthStatus.status === "unhealthy") {
                await fireHealthCheckUnhealthyAlert(
                    orgId,
                    targetCheck.targetHealthCheckId,
                    targetCheck.name ?? undefined
                );
            } else if (healthStatus.status === "healthy") {
                await fireHealthCheckHealthyAlert(
                    orgId,
                    targetCheck.targetHealthCheckId,
                    targetCheck.name ?? undefined
                );
            }

            logger.debug(
                `Updated health status for target ${targetId} to ${healthStatus.status}`
            );
            successCount++;
        }

        logger.debug(
            `Health status update complete: ${successCount} successful, ${errorCount} errors out of ${Object.keys(data.targets).length} targets`
        );
    } catch (error) {
        logger.error("Error processing healthcheck status message:", error);
    }

    return;
};
