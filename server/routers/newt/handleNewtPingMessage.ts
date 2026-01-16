import { db, sites } from "@server/db";
import { disconnectClient, getClientConfigVersion } from "#dynamic/routers/ws";
import { MessageHandler } from "@server/routers/ws";
import { clients, Newt } from "@server/db";
import { eq, lt, isNull, and, or } from "drizzle-orm";
import logger from "@server/logger";
import { validateSessionToken } from "@server/auth/sessions/app";
import { checkOrgAccessPolicy } from "#dynamic/lib/checkOrgAccessPolicy";
import { sendTerminateClient } from "../client/terminate";
import { encodeHexLowerCase } from "@oslojs/encoding";
import { sha256 } from "@oslojs/crypto/sha2";
import { sendNewtSyncMessage } from "./sync";

// Track if the offline checker interval is running
// let offlineCheckerInterval: NodeJS.Timeout | null = null;
// const OFFLINE_CHECK_INTERVAL = 30 * 1000; // Check every 30 seconds
// const OFFLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Starts the background interval that checks for clients that haven't pinged recently
 * and marks them as offline
 */
// export const startNewtOfflineChecker = (): void => {
//     if (offlineCheckerInterval) {
//         return; // Already running
//     }

//     offlineCheckerInterval = setInterval(async () => {
//         try {
//             const twoMinutesAgo = Math.floor(
//                 (Date.now() - OFFLINE_THRESHOLD_MS) / 1000
//             );

//             // TODO: WE NEED TO MAKE SURE THIS WORKS WITH DISTRIBUTED NODES ALL DOING THE SAME THING

//             // Find clients that haven't pinged in the last 2 minutes and mark them as offline
//             const offlineClients = await db
//                 .update(clients)
//                 .set({ online: false })
//                 .where(
//                     and(
//                         eq(clients.online, true),
//                         or(
//                             lt(clients.lastPing, twoMinutesAgo),
//                             isNull(clients.lastPing)
//                         )
//                     )
//                 )
//                 .returning();

//             for (const offlineClient of offlineClients) {
//                 logger.info(
//                     `Kicking offline newt client ${offlineClient.clientId} due to inactivity`
//                 );

//                 if (!offlineClient.newtId) {
//                     logger.warn(
//                         `Offline client ${offlineClient.clientId} has no newtId, cannot disconnect`
//                     );
//                     continue;
//                 }

//                 // Send a disconnect message to the client if connected
//                 try {
//                     await sendTerminateClient(
//                         offlineClient.clientId,
//                         offlineClient.newtId
//                     ); // terminate first
//                     // wait a moment to ensure the message is sent
//                     await new Promise((resolve) => setTimeout(resolve, 1000));
//                     await disconnectClient(offlineClient.newtId);
//                 } catch (error) {
//                     logger.error(
//                         `Error sending disconnect to offline newt ${offlineClient.clientId}`,
//                         { error }
//                     );
//                 }
//             }
//         } catch (error) {
//             logger.error("Error in offline checker interval", { error });
//         }
//     }, OFFLINE_CHECK_INTERVAL);

//     logger.debug("Started offline checker interval");
// };

/**
 * Stops the background interval that checks for offline clients
 */
// export const stopNewtOfflineChecker = (): void => {
//     if (offlineCheckerInterval) {
//         clearInterval(offlineCheckerInterval);
//         offlineCheckerInterval = null;
//         logger.info("Stopped offline checker interval");
//     }
// };

/**
 * Handles ping messages from clients and responds with pong
 */
export const handleNewtPingMessage: MessageHandler = async (context) => {
    const { message, client: c, sendToClient } = context;
    const newt = c as Newt;

    if (!newt) {
        logger.warn("Newt ping message: Newt not found");
        return;
    }

    if (!newt.siteId) {
        logger.warn("Newt ping message: has no site ID");
        return;
    }

    // get the version
    const configVersion = await getClientConfigVersion(newt.newtId);

    if (message.configVersion && configVersion != null && configVersion != message.configVersion) {
        logger.warn(
            `Newt ping with outdated config version: ${message.configVersion} (current: ${configVersion})`
        );

        // get the site
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

    // try {
    //     // Update the client's last ping timestamp
    //     await db
    //         .update(clients)
    //         .set({
    //             lastPing: Math.floor(Date.now() / 1000),
    //             online: true
    //         })
    //         .where(eq(clients.clientId, newt.clientId));
    // } catch (error) {
    //     logger.error("Error handling ping message", { error });
    // }

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
