import { drizzle as DrizzleSqlite } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema/schema";
import path from "path";
import fs from "fs";
import { APP_PATH } from "@server/lib/consts";
import { existsSync, mkdirSync } from "fs";

// Temporary diagnostic trace for the random better-sqlite3 native aborts
// (Statement::~Statement -> RemoveEnvironmentCleanupHook assertion). That
// abort is a hard SIGABRT from native code, so it bypasses uncaughtException/
// unhandledRejection and can outrun winston's async file transport. This
// writes every statement text synchronously (fsync'd via appendFileSync) so
// the statements immediately preceding a crash survive it. better-sqlite3's
// `verbose` hook fires for BEGIN/SAVEPOINT/RELEASE/COMMIT/ROLLBACK too, since
// those are just prepared statements under the hood - so this also lets us
// see if two "transactions" ever overlap on the shared connection.
// Enable with SQL_TRACE=true; remove once the crash is root-caused.
function sqlTraceVerbose():
    | ((message: unknown, ...args: unknown[]) => void)
    | undefined {
    if (process.env.SQL_TRACE !== "true") {
        return undefined;
    }
    const traceLogDir = path.join(APP_PATH, "logs");
    if (!existsSync(traceLogDir)) {
        mkdirSync(traceLogDir, { recursive: true });
    }
    const traceLogPath = path.join(traceLogDir, "sql-trace.log");
    let seq = 0;
    return (message: unknown) => {
        seq += 1;
        const line = `${new Date().toISOString()} pid=${process.pid} #${seq} ${String(message).replace(/\s+/g, " ").trim()}\n`;
        try {
            fs.appendFileSync(traceLogPath, line);
        } catch {
            // best-effort diagnostic logging only
        }
    };
}

export const location = path.join(APP_PATH, "db", "db.sqlite");
export const exists = checkFileExists(location);

bootstrapVolume();

function createDb() {
    const verbose =
        process.env.QUERY_LOGGING == "true" ? sqlTraceVerbose() : undefined;
    const sqlite = new Database(location, { verbose });

    if (process.env.ENABLE_SQLITE_WAL_MODE == "true") {
        // Enable WAL mode — allows concurrent readers + single writer, preventing
        // contention across subsystems (verifySession, Traefik, audit, ping).
        // NOTE: journal_mode persists in the DB file once set; unsetting this
        // env var does NOT revert an existing WAL database.
        sqlite.pragma("journal_mode = WAL");
        // NORMAL sync mode: safe with WAL, reduces write lock hold time.
        sqlite.pragma("synchronous = NORMAL");
    }

    // No busy_timeout pragma: better-sqlite3 already arms
    // sqlite3_busy_timeout(db, 5000) via its default `timeout` option
    // (lib/database.js), so an explicit pragma is redundant.

    // Intentionally NOT setting cache_size or mmap_size: a large page cache plus
    // a multi-hundred-MB mmap region inflate RSS and cause page-cache thrashing
    // on small (~1 GB) instances. Leave SQLite on its conservative defaults.

    // Intentionally NOT wrapping prepare()/statements: better-sqlite3 finalizes
    // sqlite3_stmt in the Statement destructor at GC, and drizzle-orm prepares a
    // fresh statement per query (no statement cache), so statements cannot
    // accumulate. better-sqlite3 11.x exposes no Statement.finalize() at all.

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
