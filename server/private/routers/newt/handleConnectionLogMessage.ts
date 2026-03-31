import { db, logsDb } from "@server/db";
import { MessageHandler } from "@server/routers/ws";
import { connectionAuditLog, sites, Newt, clients, orgs } from "@server/db";
import { and, eq, lt, inArray } from "drizzle-orm";
import logger from "@server/logger";
import { inflate } from "zlib";
import { promisify } from "util";
import { calculateCutoffTimestamp } from "@server/lib/cleanupLogs";

const zlibInflate = promisify(inflate);

// Retry configuration for deadlock handling
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 50;

// How often to flush accumulated connection log data to the database
const FLUSH_INTERVAL_MS = 30_000; // 30 seconds

// Maximum number of records to buffer before forcing a flush
const MAX_BUFFERED_RECORDS = 500;

// Maximum number of records to insert in a single batch
const INSERT_BATCH_SIZE = 100;

interface ConnectionSessionData {
    sessionId: string;
    resourceId: number;
    sourceAddr: string;
    destAddr: string;
    protocol: string;
    startedAt: string; // ISO 8601 timestamp
    endedAt?: string; // ISO 8601 timestamp
    bytesTx?: number;
    bytesRx?: number;
}

interface ConnectionLogRecord {
    sessionId: string;
    siteResourceId: number;
    orgId: string;
    siteId: number;
    clientId: number | null;
    userId: string | null;
    sourceAddr: string;
    destAddr: string;
    protocol: string;
    startedAt: number; // epoch seconds
    endedAt: number | null;
    bytesTx: number | null;
    bytesRx: number | null;
}

// In-memory buffer of records waiting to be flushed
let buffer: ConnectionLogRecord[] = [];

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

/**
 * Decompress a base64-encoded zlib-compressed string into parsed JSON.
 */
async function decompressConnectionLog(
    compressed: string
): Promise<ConnectionSessionData[]> {
    const compressedBuffer = Buffer.from(compressed, "base64");
    const decompressed = await zlibInflate(compressedBuffer);
    const jsonString = decompressed.toString("utf-8");
    const parsed = JSON.parse(jsonString);

    if (!Array.isArray(parsed)) {
        throw new Error("Decompressed connection log data is not an array");
    }

    return parsed;
}

/**
 * Convert an ISO 8601 timestamp string to epoch seconds.
 * Returns null if the input is falsy.
 */
function toEpochSeconds(isoString: string | undefined | null): number | null {
    if (!isoString) {
        return null;
    }
    const ms = new Date(isoString).getTime();
    if (isNaN(ms)) {
        return null;
    }
    return Math.floor(ms / 1000);
}

/**
 * Flush all buffered connection log records to the database.
 *
 * Swaps out the buffer before writing so that any records added during the
 * flush are captured in the new buffer rather than being lost. Entries that
 * fail to write are re-queued back into the buffer so they will be retried
 * on the next flush.
 *
 * This function is exported so that the application's graceful-shutdown
 * cleanup handler can call it before the process exits.
 */
export async function flushConnectionLogToDb(): Promise<void> {
    if (buffer.length === 0) {
        return;
    }

    // Atomically swap out the buffer so new data keeps flowing in
    const snapshot = buffer;
    buffer = [];

    logger.debug(
        `Flushing ${snapshot.length} connection log record(s) to the database`
    );

    // Insert in batches to avoid overly large SQL statements
    for (let i = 0; i < snapshot.length; i += INSERT_BATCH_SIZE) {
        const batch = snapshot.slice(i, i + INSERT_BATCH_SIZE);

        try {
            await withDeadlockRetry(async () => {
                await logsDb.insert(connectionAuditLog).values(batch);
            }, `flush connection log batch (${batch.length} records)`);
        } catch (error) {
            logger.error(
                `Failed to flush connection log batch of ${batch.length} records:`,
                error
            );

            // Re-queue the failed batch so it is retried on the next flush
            buffer = [...batch, ...buffer];

            // Cap buffer to prevent unbounded growth if DB is unreachable
            if (buffer.length > MAX_BUFFERED_RECORDS * 5) {
                const dropped = buffer.length - MAX_BUFFERED_RECORDS * 5;
                buffer = buffer.slice(0, MAX_BUFFERED_RECORDS * 5);
                logger.warn(
                    `Connection log buffer overflow, dropped ${dropped} oldest records`
                );
            }

            // Stop trying further batches from this snapshot — they'll be
            // picked up by the next flush via the re-queued records above
            const remaining = snapshot.slice(i + INSERT_BATCH_SIZE);
            if (remaining.length > 0) {
                buffer = [...remaining, ...buffer];
            }
            break;
        }
    }
}

const flushTimer = setInterval(async () => {
    try {
        await flushConnectionLogToDb();
    } catch (error) {
        logger.error(
            "Unexpected error during periodic connection log flush:",
            error
        );
    }
}, FLUSH_INTERVAL_MS);

// Calling unref() means this timer will not keep the Node.js event loop alive
// on its own — the process can still exit normally when there is no other work
// left.  The graceful-shutdown path will call flushConnectionLogToDb() explicitly
// before process.exit(), so no data is lost.
flushTimer.unref();

export async function cleanUpOldLogs(orgId: string, retentionDays: number) {
    const cutoffTimestamp = calculateCutoffTimestamp(retentionDays);

    try {
        await logsDb
            .delete(connectionAuditLog)
            .where(
                and(
                    lt(connectionAuditLog.startedAt, cutoffTimestamp),
                    eq(connectionAuditLog.orgId, orgId)
                )
            );

        // logger.debug(
        //     `Cleaned up connection audit logs older than ${retentionDays} days`
        // );
    } catch (error) {
        logger.error("Error cleaning up old connection audit logs:", error);
    }
}

export const handleConnectionLogMessage: MessageHandler = async (context) => {
    const { message, client } = context;
    const newt = client as Newt;

    if (!newt) {
        logger.warn("Connection log received but no newt client in context");
        return;
    }

    if (!newt.siteId) {
        logger.warn("Connection log received but newt has no siteId");
        return;
    }

    if (!message.data?.compressed) {
        logger.warn("Connection log message missing compressed data");
        return;
    }

    // Look up the org for this site
    const [site] = await db
        .select({ orgId: sites.orgId, orgSubnet: orgs.subnet })
        .from(sites)
        .innerJoin(orgs, eq(sites.orgId, orgs.orgId))
        .where(eq(sites.siteId, newt.siteId));

    if (!site) {
        logger.warn(
            `Connection log received but site ${newt.siteId} not found in database`
        );
        return;
    }

    const orgId = site.orgId;

    // Extract the CIDR suffix (e.g. "/16") from the org subnet so we can
    // reconstruct the exact subnet string stored on each client record.
    const cidrSuffix = site.orgSubnet?.includes("/")
        ? site.orgSubnet.substring(site.orgSubnet.indexOf("/"))
        : null;

    let sessions: ConnectionSessionData[];
    try {
        sessions = await decompressConnectionLog(message.data.compressed);
    } catch (error) {
        logger.error("Failed to decompress connection log data:", error);
        return;
    }

    if (sessions.length === 0) {
        return;
    }

    logger.debug(`Sessions: ${JSON.stringify(sessions)}`)

    // Build a map from sourceAddr → { clientId, userId } by querying clients
    // whose subnet field matches exactly. Client subnets are stored with the
    // org's CIDR suffix (e.g. "100.90.128.5/16"), so we reconstruct that from
    // each unique sourceAddr + the org's CIDR suffix and do a targeted IN query.
    const ipToClient = new Map<string, { clientId: number; userId: string | null }>();

    if (cidrSuffix) {
        // Collect unique source addresses so we only query for what we need
        const uniqueSourceAddrs = new Set<string>();
        for (const session of sessions) {
            if (session.sourceAddr) {
                uniqueSourceAddrs.add(session.sourceAddr);
            }
        }

        if (uniqueSourceAddrs.size > 0) {
            // Construct the exact subnet strings as stored in the DB
            const subnetQueries = Array.from(uniqueSourceAddrs).map(
                (addr) => {
                    // Strip port if present (e.g. "100.90.128.1:38004" → "100.90.128.1")
                    const ip = addr.includes(":") ? addr.split(":")[0] : addr;
                    return `${ip}${cidrSuffix}`;
                }
            );

            logger.debug(`Subnet queries: ${JSON.stringify(subnetQueries)}`);

            const matchedClients = await db
                .select({
                    clientId: clients.clientId,
                    userId: clients.userId,
                    subnet: clients.subnet
                })
                .from(clients)
                .where(
                    and(
                        eq(clients.orgId, orgId),
                        inArray(clients.subnet, subnetQueries)
                    )
                );

            for (const c of matchedClients) {
                const ip = c.subnet.split("/")[0];
                logger.debug(`Client ${c.clientId} subnet ${c.subnet} matches ${ip}`);
                ipToClient.set(ip, { clientId: c.clientId, userId: c.userId });
            }
        }
    }

    // Convert to DB records and add to the buffer
    for (const session of sessions) {
        // Validate required fields
        if (
            !session.sessionId ||
            !session.resourceId ||
            !session.sourceAddr ||
            !session.destAddr ||
            !session.protocol
        ) {
            logger.debug(
                `Skipping connection log session with missing required fields: ${JSON.stringify(session)}`
            );
            continue;
        }

        const startedAt = toEpochSeconds(session.startedAt);
        if (startedAt === null) {
            logger.debug(
                `Skipping connection log session with invalid startedAt: ${session.startedAt}`
            );
            continue;
        }

        // Match the source address to a client. The sourceAddr is the
        // client's IP on the WireGuard network, which corresponds to the IP
        // portion of the client's subnet CIDR (e.g. "100.90.128.5/24").
        // Strip port if present (e.g. "100.90.128.1:38004" → "100.90.128.1")
        const sourceIp = session.sourceAddr.includes(":") ? session.sourceAddr.split(":")[0] : session.sourceAddr;
        const clientInfo = ipToClient.get(sourceIp) ?? null;


        buffer.push({
            sessionId: session.sessionId,
            siteResourceId: session.resourceId,
            orgId,
            siteId: newt.siteId,
            clientId: clientInfo?.clientId ?? null,
            userId: clientInfo?.userId ?? null,
            sourceAddr: session.sourceAddr,
            destAddr: session.destAddr,
            protocol: session.protocol,
            startedAt,
            endedAt: toEpochSeconds(session.endedAt),
            bytesTx: session.bytesTx ?? null,
            bytesRx: session.bytesRx ?? null
        });
    }

    logger.debug(
        `Buffered ${sessions.length} connection log session(s) from newt ${newt.newtId} (site ${newt.siteId})`
    );

    // If the buffer has grown large enough, trigger an immediate flush
    if (buffer.length >= MAX_BUFFERED_RECORDS) {
        // Fire and forget — errors are handled inside flushConnectionLogToDb
        flushConnectionLogToDb().catch((error) => {
            logger.error(
                "Unexpected error during size-triggered connection log flush:",
                error
            );
        });
    }
};
