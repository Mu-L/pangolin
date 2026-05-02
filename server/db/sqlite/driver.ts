import { drizzle as DrizzleSqlite } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import type BetterSqlite3 from "better-sqlite3";
import * as schema from "./schema/schema";
import path from "path";
import fs from "fs";
import { APP_PATH } from "@server/lib/consts";
import { existsSync, mkdirSync } from "fs";

export const location = path.join(APP_PATH, "db", "db.sqlite");
export const exists = checkFileExists(location);

bootstrapVolume();

/**
 * Wrap a better-sqlite3 Statement so that the native sqlite3_stmt handle
 * is released immediately after the first execution instead of waiting
 * for V8 garbage collection.
 *
 * Background: drizzle-orm creates a **new** native prepared statement for
 * every query execution (`session.prepareQuery` → `this.client.prepare`).
 * Each native `sqlite3_stmt` consumes 8-32 KB of off-heap memory and is
 * only freed when V8's GC collects the JS wrapper.  Under sustained load
 * (e.g. Uptime Kuma polling verify-session), statement creation outpaces
 * GC, causing steady native memory growth — the root cause of #2120.
 *
 * By calling `stmt.finalize()` right after `.all()` / `.get()` / `.run()`
 * returns, the native memory is freed deterministically.  This is safe
 * because drizzle's one-time queries only invoke each statement once.
 */
function autoFinalizeStatement(stmt: BetterSqlite3.Statement): BetterSqlite3.Statement {
    const wrapExec = <T extends (...args: any[]) => any>(fn: T): T => {
        return function (this: any, ...args: any[]) {
            try {
                return fn.apply(this, args);
            } finally {
                try {
                    // finalize() exists on the native Statement at runtime but
                    // is missing from @types/better-sqlite3.
                    (stmt as any).finalize();
                } catch {
                    // Already finalized — harmless
                }
            }
        } as unknown as T;
    };

    stmt.run = wrapExec(stmt.run);
    stmt.get = wrapExec(stmt.get);
    stmt.all = wrapExec(stmt.all);

    return stmt;
}

function createDb() {
    const sqlite = new Database(location);

    // Enable WAL mode for dramatically better concurrent read/write
    // performance. Without this, readers block writers and vice versa,
    // causing severe contention when multiple subsystems (verifySession,
    // TraefikConfigManager, audit log flushes, ping flushes) all share
    // this single connection. WAL mode allows concurrent readers with a
    // single writer, which is the typical access pattern.
    sqlite.pragma("journal_mode = WAL");

    // Wait up to 5 seconds when the database is locked instead of
    // failing immediately with SQLITE_BUSY. This prevents transient
    // write failures from causing audit log buffer re-queues and retry
    // loops that accumulate memory.
    sqlite.pragma("busy_timeout = 5000");

    // NORMAL synchronous mode is safe with WAL and significantly reduces
    // the time each write holds the database lock.
    sqlite.pragma("synchronous = NORMAL");

    // Increase the page cache to 64 MB (negative value = KB). The
    // default (2 MB) causes frequent I/O round-trips on the large JOIN
    // queries used by TraefikConfigManager, which block the event loop
    // for longer than necessary.
    sqlite.pragma("cache_size = -65536");

    // Enable memory-mapped I/O for reads (256 MB). This allows the OS
    // to serve read queries from the page cache without going through
    // SQLite's own cache, reducing event-loop blocking time.
    sqlite.pragma("mmap_size = 268435456");

    // Intercept prepare() so every statement produced by drizzle-orm is
    // automatically finalized after its first (and only) execution.
    // This prevents the native sqlite3_stmt objects from accumulating
    // until the next GC cycle.
    const originalPrepare = sqlite.prepare.bind(sqlite);
    (sqlite as any).prepare = function autoFinalizePrepare(source: string) {
        return autoFinalizeStatement(originalPrepare(source));
    };

    return DrizzleSqlite(sqlite, {
        schema
    });
}

export const db = createDb();
export default db;
export const primaryDb = db;
export type Transaction = Parameters<
    Parameters<(typeof db)["transaction"]>[0]
    >[0];
export const DB_TYPE: "pg" | "sqlite" = "sqlite";

function checkFileExists(filePath: string): boolean {
    try {
        fs.accessSync(filePath);
        return true;
    } catch {
        return false;
    }
}

function bootstrapVolume() {
    const appPath = APP_PATH;

    const dbDir = path.join(appPath, "db");
    const logsDir = path.join(appPath, "logs");

    // check if the db directory exists and create it if it doesn't
    if (!existsSync(dbDir)) {
        mkdirSync(dbDir, { recursive: true });
    }

    // check if the logs directory exists and create it if it doesn't
    if (!existsSync(logsDir)) {
        mkdirSync(logsDir, { recursive: true });
    }

    // THIS IS FOR TRAEFIK; NOT REALLY NEEDED, BUT JUST IN CASE

    const traefikDir = path.join(appPath, "traefik");

    // check if the traefik directory exists and create it if it doesn't
    if (!existsSync(traefikDir)) {
        mkdirSync(traefikDir, { recursive: true });
    }
}
