import { db, newts, sites, targetHealthCheck, targets } from "@server/db";
import {
    hasActiveConnections,
    getClientConfigVersion
} from "#dynamic/routers/ws";
import { MessageHandler } from "@server/routers/ws";
import { Newt } from "@server/db";
import { eq, lt, isNull, and, or, ne, not } from "drizzle-orm";
import logger from "@server/logger";
import { sendNewtSyncMessage } from "./sync";
import { recordPing } from "./pingAccumulator";

// Track if the offline checker interval is running
let offlineCheckerInterval: NodeJS.Timeout | null = null;
const OFFLINE_CHECK_INTERVAL = 30 * 1000; // Check every 30 seconds
const OFFLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes
const OFFLINE_THRESHOLD_BANDWIDTH_MS = 8 * 60 * 1000; // 8 minutes

/**
 * Starts the background interval that checks for newt sites that haven't
 * pinged recently and marks them as offline. For backward compatibility,
 * a site is only marked offline when there is no active WebSocket connection
 * either — so older newt versions that don't send pings but remain connected
 * continue to be treated as online.
 */
export const startNewtOfflineChecker = (): void => {
    if (offlineCheckerInterval) {
        return; // Already running
    }

    offlineCheckerInterval = setInterval(async () => {
        try {
            const twoMinutesAgo = Math.floor(
                (Date.now() - OFFLINE_THRESHOLD_MS) / 1000
            );

            // Find all online newt-type sites that haven't pinged recently
            // (or have never pinged at all). Join newts to obtain the newtId
            // needed for the WebSocket connection check.
            const staleSites = await db
                .select({
                    siteId: sites.siteId,
                    newtId: newts.newtId,
                    lastPing: sites.lastPing
                })
                .from(sites)
                .innerJoin(newts, eq(newts.siteId, sites.siteId))
                .where(
                    and(
                        eq(sites.online, true),
                        eq(sites.type, "newt"),
                        or(
                            lt(sites.lastPing, twoMinutesAgo),
                            isNull(sites.lastPing)
                        )
                    )
                );

            for (const staleSite of staleSites) {
                // Backward-compatibility check: if the newt still has an
                // active WebSocket connection (older clients that don't send
                // pings), keep the site online.
                const isConnected = await hasActiveConnections(
                    staleSite.newtId
                );
                if (isConnected) {
                    logger.debug(
                        `Newt ${staleSite.newtId} has not pinged recently but is still connected via WebSocket — keeping site ${staleSite.siteId} online`
                    );
                    continue;
                }

                logger.info(
                    `Marking site ${staleSite.siteId} offline: newt ${staleSite.newtId} has no recent ping and no active WebSocket connection`
                );

                await db
                    .update(sites)
                    .set({ online: false })
                    .where(eq(sites.siteId, staleSite.siteId));

                const healthChecksOnSite = await db
                    .select()
                    .from(targetHealthCheck)
                    .innerJoin(
                        targets,
                        eq(targets.targetId, targetHealthCheck.targetId)
                    )
                    .innerJoin(sites, eq(sites.siteId, targets.siteId))
                    .where(eq(sites.siteId, staleSite.siteId));

                for (const healthCheck of healthChecksOnSite) {
                    logger.info(
                        `Marking health check ${healthCheck.targetHealthCheck.targetHealthCheckId} offline due to site ${staleSite.siteId} being marked offline`
                    );
                    await db
                        .update(targetHealthCheck)
                        .set({ hcHealth: "unknown" })
                        .where(
                            eq(
                                targetHealthCheck.targetHealthCheckId,
                                healthCheck.targetHealthCheck
                                    .targetHealthCheckId
                            )
                        );
                }
            }

            // this part only effects self hosted. Its not efficient but we dont expect people to have very many wireguard sites
            // select all of the wireguard sites to evaluate if they need to be offline due to the last bandwidth update
            const allWireguardSites = await db
                .select({
                    siteId: sites.siteId,
                    online: sites.online,
                    lastBandwidthUpdate: sites.lastBandwidthUpdate
                })
                .from(sites)
                .where(
                    and(
                        eq(sites.type, "wireguard"),
                        not(isNull(sites.lastBandwidthUpdate))
                    )
                );

            const wireguardOfflineThreshold = Math.floor(
                (Date.now() - OFFLINE_THRESHOLD_BANDWIDTH_MS) / 1000
            );

            // loop over each one. If its offline and there is a new update then mark it online. If its online and there is no update then mark it offline
            for (const site of allWireguardSites) {
                const lastBandwidthUpdate =
                    new Date(site.lastBandwidthUpdate!).getTime() / 1000;
                if (
                    lastBandwidthUpdate < wireguardOfflineThreshold &&
                    site.online
                ) {
                    logger.info(
                        `Marking wireguard site ${site.siteId} offline: no bandwidth update in over ${OFFLINE_THRESHOLD_BANDWIDTH_MS / 60000} minutes`
                    );

                    await db
                        .update(sites)
                        .set({ online: false })
                        .where(eq(sites.siteId, site.siteId));
                } else if (
                    lastBandwidthUpdate >= wireguardOfflineThreshold &&
                    !site.online
                ) {
                    logger.info(
                        `Marking wireguard site ${site.siteId} online: recent bandwidth update`
                    );

                    await db
                        .update(sites)
                        .set({ online: true })
                        .where(eq(sites.siteId, site.siteId));
                }
            }
        } catch (error) {
            logger.error("Error in newt offline checker interval", { error });
        }
    }, OFFLINE_CHECK_INTERVAL);

    logger.debug("Started newt offline checker interval");
};

/**
 * Stops the background interval that checks for offline newt sites.
 */
export const stopNewtOfflineChecker = (): void => {
    if (offlineCheckerInterval) {
        clearInterval(offlineCheckerInterval);
        offlineCheckerInterval = null;
        logger.info("Stopped newt offline checker interval");
    }
};

/**
 * Handles ping messages from newt clients.
 *
 * On each ping:
 *  - Marks the associated site as online.
 *  - Records the current timestamp as the newt's last-ping time.
 *  - Triggers a config sync if the newt is running an outdated config version.
 *  - Responds with a pong message.
 */
export const handleNewtPingMessage: MessageHandler = async (context) => {
    const { message, client: c } = context;
    const newt = c as Newt;

    if (!newt) {
        logger.warn("Newt ping message: Newt not found");
        return;
    }

    if (!newt.siteId) {
        logger.warn("Newt ping message: has no site ID");
        return;
    }

    // Record the ping in memory; it will be flushed to the database
    // periodically by the ping accumulator (every ~10s) in a single
    // batched UPDATE instead of one query per ping. This prevents
    // connection pool exhaustion under load, especially with
    // cross-region latency to the database.
    recordPing(newt.siteId);

    // Check config version and sync if stale.
    const configVersion = await getClientConfigVersion(newt.newtId);

    if (
        message.configVersion != null &&
        configVersion != null &&
        configVersion !== message.configVersion
    ) {
        logger.warn(
            `Newt ping with outdated config version: ${message.configVersion} (current: ${configVersion})`
        );

        const [site] = await db
            .select()
            .from(sites)
            .where(eq(sites.siteId, newt.siteId))
            .limit(1);

        if (!site) {
            logger.warn(
                `Newt ping message: site with ID ${newt.siteId} not found`
            );
            return;
        }

        await sendNewtSyncMessage(newt, site);
    }

    return {
        message: {
            type: "pong",
            data: {
                timestamp: new Date().toISOString()
            }
        },
        broadcast: false,
        excludeSender: false
    };
};
