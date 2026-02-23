import { db } from "./driver";

/**
 * Runs a read query. For SQLite there is no replica/primary distinction,
 * so the query is executed once against the database.
 */
export async function safeRead<T>(
    query: (d: typeof db) => Promise<T>
): Promise<T> {
    return query(db);
}
