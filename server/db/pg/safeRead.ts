import { db, primaryDb } from "./driver";

/**
 * Runs a read query with replica fallback for Postgres.
 * Executes the query against the replica first (when replicas exist).
 * If the query throws or returns no data (null, undefined, or empty array),
 * runs the same query against the primary.
 */
export async function safeRead<T>(
    query: (d: typeof db | typeof primaryDb) => Promise<T>
): Promise<T> {
    try {
        const result = await query(db);
        if (result === undefined || result === null) {
            return query(primaryDb);
        }
        if (Array.isArray(result) && result.length === 0) {
            return query(primaryDb);
        }
        return result;
    } catch {
        return query(primaryDb);
    }
}
