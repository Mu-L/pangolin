import { clientPostureSnapshots, db, fingerprints } from "@server/db";
import { disconnectClient } from "#dynamic/routers/ws";
import { MessageHandler } from "@server/routers/ws";
import { clients, Olm } from "@server/db";
import { eq, lt, isNull, and, or } from "drizzle-orm";
import logger from "@server/logger";
import { validateSessionToken } from "@server/auth/sessions/app";
import { checkOrgAccessPolicy } from "#dynamic/lib/checkOrgAccessPolicy";
import { sendTerminateClient } from "../client/terminate";
import { encodeHexLowerCase } from "@oslojs/encoding";
import { sha256 } from "@oslojs/crypto/sha2";

// Track if the offline checker interval is running
let offlineCheckerInterval: NodeJS.Timeout | null = null;
const OFFLINE_CHECK_INTERVAL = 30 * 1000; // Check every 30 seconds
const OFFLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Starts the background interval that checks for clients that haven't pinged recently
 * and marks them as offline
 */
export const startOlmOfflineChecker = (): void => {
    if (offlineCheckerInterval) {
        return; // Already running
    }

    offlineCheckerInterval = setInterval(async () => {
        try {
            const twoMinutesAgo = Math.floor(
                (Date.now() - OFFLINE_THRESHOLD_MS) / 1000
            );

            // TODO: WE NEED TO MAKE SURE THIS WORKS WITH DISTRIBUTED NODES ALL DOING THE SAME THING

            // Find clients that haven't pinged in the last 2 minutes and mark them as offline
            const offlineClients = await db
                .update(clients)
                .set({ online: false })
                .where(
                    and(
                        eq(clients.online, true),
                        or(
                            lt(clients.lastPing, twoMinutesAgo),
                            isNull(clients.lastPing)
                        )
                    )
                )
                .returning();

            for (const offlineClient of offlineClients) {
                logger.info(
                    `Kicking offline olm client ${offlineClient.clientId} due to inactivity`
                );

                if (!offlineClient.olmId) {
                    logger.warn(
                        `Offline client ${offlineClient.clientId} has no olmId, cannot disconnect`
                    );
                    continue;
                }

                // Send a disconnect message to the client if connected
                try {
                    await sendTerminateClient(
                        offlineClient.clientId,
                        offlineClient.olmId
                    ); // terminate first
                    // wait a moment to ensure the message is sent
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                    await disconnectClient(offlineClient.olmId);
                } catch (error) {
                    logger.error(
                        `Error sending disconnect to offline olm ${offlineClient.clientId}`,
                        { error }
                    );
                }
            }
        } catch (error) {
            logger.error("Error in offline checker interval", { error });
        }
    }, OFFLINE_CHECK_INTERVAL);

    logger.debug("Started offline checker interval");
};

/**
 * Stops the background interval that checks for offline clients
 */
export const stopOlmOfflineChecker = (): void => {
    if (offlineCheckerInterval) {
        clearInterval(offlineCheckerInterval);
        offlineCheckerInterval = null;
        logger.info("Stopped offline checker interval");
    }
};

/**
 * Handles ping messages from clients and responds with pong
 */
export const handleOlmPingMessage: MessageHandler = async (context) => {
    const { message, client: c, sendToClient } = context;
    const olm = c as Olm;

    const { userToken, fingerprint, postures } = message.data;

    if (!olm) {
        logger.warn("Olm not found");
        return;
    }

    if (olm.userId) {
        // we need to check a user token to make sure its still valid
        const { session: userSession, user } =
            await validateSessionToken(userToken);
        if (!userSession || !user) {
            logger.warn("Invalid user session for olm ping");
            return; // by returning here we just ignore the ping and the setInterval will force it to disconnect
        }
        if (user.userId !== olm.userId) {
            logger.warn("User ID mismatch for olm ping");
            return;
        }

        // get the client
        const [client] = await db
            .select()
            .from(clients)
            .where(
                and(
                    eq(clients.olmId, olm.olmId),
                    eq(clients.userId, olm.userId)
                )
            )
            .limit(1);

        if (!client) {
            logger.warn("Client not found for olm ping");
            return;
        }

        const sessionId = encodeHexLowerCase(
            sha256(new TextEncoder().encode(userToken))
        );

        const policyCheck = await checkOrgAccessPolicy({
            orgId: client.orgId,
            userId: olm.userId,
            sessionId // this is the user token passed in the message
        });

        if (!policyCheck.allowed) {
            logger.warn(
                `Olm user ${olm.userId} does not pass access policies for org ${client.orgId}: ${policyCheck.error}`
            );
            return;
        }
    }

    if (!olm.clientId) {
        logger.warn("Olm has no client ID!");
        return;
    }

    try {
        // Update the client's last ping timestamp
        await db
            .update(clients)
            .set({
                lastPing: Math.floor(Date.now() / 1000),
                online: true
            })
            .where(eq(clients.clientId, olm.clientId));
    } catch (error) {
        logger.error("Error handling ping message", { error });
    }

    const now = Math.floor(Date.now() / 1000);

    if (fingerprint && olm.olmId) {
        const [existingFingerprint] = await db
            .select()
            .from(fingerprints)
            .where(eq(fingerprints.olmId, olm.olmId))
            .limit(1);

        if (!existingFingerprint) {
            await db.insert(fingerprints).values({
                olmId: olm.olmId,
                firstSeen: now,
                lastSeen: now,

                username: fingerprint.username,
                hostname: fingerprint.hostname,
                platform: fingerprint.platform,
                osVersion: fingerprint.osVersion,
                kernelVersion: fingerprint.kernelVersion,
                arch: fingerprint.arch,
                deviceModel: fingerprint.deviceModel,
                serialNumber: fingerprint.serialNumber,
                platformFingerprint: fingerprint.platformFingerprint
            });
        } else {
            await db
                .update(fingerprints)
                .set({
                    lastSeen: now,

                    username: fingerprint.username,
                    hostname: fingerprint.hostname,
                    platform: fingerprint.platform,
                    osVersion: fingerprint.osVersion,
                    kernelVersion: fingerprint.kernelVersion,
                    arch: fingerprint.arch,
                    deviceModel: fingerprint.deviceModel,
                    serialNumber: fingerprint.serialNumber,
                    platformFingerprint: fingerprint.platformFingerprint
                })
                .where(eq(fingerprints.olmId, olm.olmId));
        }
    }

    if (postures && olm.clientId) {
        await db.insert(clientPostureSnapshots).values({
            clientId: olm.clientId,

            biometricsEnabled: postures?.biometricsEnabled,
            diskEncrypted: postures?.diskEncrypted,
            firewallEnabled: postures?.firewallEnabled,
            autoUpdatesEnabled: postures?.autoUpdatesEnabled,
            tpmAvailable: postures?.tpmAvailable,

            windowsDefenderEnabled: postures?.windowsDefenderEnabled,

            macosSipEnabled: postures?.macosSipEnabled,
            macosGatekeeperEnabled: postures?.macosGatekeeperEnabled,
            macosFirewallStealthMode: postures?.macosFirewallStealthMode,

            linuxAppArmorEnabled: postures?.linuxAppArmorEnabled,
            linuxSELinuxEnabled: postures?.linuxSELinuxEnabled,

            collectedAt: now
        });
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
