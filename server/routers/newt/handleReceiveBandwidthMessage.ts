import { db } from "@server/db";
import { MessageHandler } from "@server/routers/ws";
import { clients } from "@server/db";
import { eq, sql } from "drizzle-orm";
import logger from "@server/logger";

interface PeerBandwidth {
    publicKey: string;
    bytesIn: number;
    bytesOut: number;
}

// Retry configuration for deadlock handling
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 50;

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

export const handleReceiveBandwidthMessage: MessageHandler = async (
    context
) => {
    const { message } = context;

    if (!message.data.bandwidthData) {
        logger.warn("No bandwidth data provided");
        return;
    }

    const bandwidthData: PeerBandwidth[] = message.data.bandwidthData;

    if (!Array.isArray(bandwidthData)) {
        throw new Error("Invalid bandwidth data");
    }

    // Sort bandwidth data by publicKey to ensure consistent lock ordering across all instances
    // This is critical for preventing deadlocks when multiple instances update the same clients
    const sortedBandwidthData = [...bandwidthData].sort((a, b) =>
        a.publicKey.localeCompare(b.publicKey)
    );

    const currentTime = new Date().toISOString();

    // Update each client individually with retry logic
    // This reduces transaction scope and allows retries per-client
    for (const peer of sortedBandwidthData) {
        const { publicKey, bytesIn, bytesOut } = peer;

        try {
            await withDeadlockRetry(async () => {
                // Use atomic SQL increment to avoid SELECT then UPDATE pattern
                // This eliminates the need to read the current value first
                await db
                    .update(clients)
                    .set({
                        // Note: bytesIn from peer goes to megabytesOut (data sent to client)
                        // and bytesOut from peer goes to megabytesIn (data received from client)
                        megabytesOut: sql`COALESCE(${clients.megabytesOut}, 0) + ${bytesIn}`,
                        megabytesIn: sql`COALESCE(${clients.megabytesIn}, 0) + ${bytesOut}`,
                        lastBandwidthUpdate: currentTime
                    })
                    .where(eq(clients.pubKey, publicKey));
            }, `update client bandwidth ${publicKey}`);
        } catch (error) {
            logger.error(
                `Failed to update bandwidth for client ${publicKey}:`,
                error
            );
            // Continue with other clients even if one fails
        }
    }
};
