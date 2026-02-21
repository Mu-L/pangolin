import { drizzle as DrizzlePostgres } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { readConfigFile } from "@server/lib/readConfigFile";
import { readPrivateConfigFile } from "@server/private/lib/readConfigFile";
import { withReplicas } from "drizzle-orm/pg-core";
import { build } from "@server/build";
import { db as mainDb, primaryDb as mainPrimaryDb } from "./driver";

function createLogsDb() {
    // Only use separate logs database in SaaS builds
    if (build !== "saas") {
        return mainDb;
    }

    const config = readConfigFile();
    const privateConfig = readPrivateConfigFile();

    // Merge configs, prioritizing private config
    const logsConfig = privateConfig.postgres_logs || config.postgres_logs;

    // Check environment variable first
    let connectionString = process.env.POSTGRES_LOGS_CONNECTION_STRING;
    let replicaConnections: Array<{ connection_string: string }> = [];

    if (!connectionString && logsConfig) {
        connectionString = logsConfig.connection_string;
        replicaConnections = logsConfig.replicas || [];
    }

    // If POSTGRES_LOGS_REPLICA_CONNECTION_STRINGS is set, use it
    if (process.env.POSTGRES_LOGS_REPLICA_CONNECTION_STRINGS) {
        replicaConnections =
            process.env.POSTGRES_LOGS_REPLICA_CONNECTION_STRINGS.split(",").map(
                (conn) => ({
                    connection_string: conn.trim()
                })
            );
    }

    // If no logs database is configured, fall back to main database
    if (!connectionString) {
        return mainDb;
    }

    // Create separate connection pool for logs database
    const poolConfig = logsConfig?.pool || config.postgres?.pool;
    const primaryPool = new Pool({
        connectionString,
        max: poolConfig?.max_connections || 20,
        idleTimeoutMillis: poolConfig?.idle_timeout_ms || 30000,
        connectionTimeoutMillis: poolConfig?.connection_timeout_ms || 5000
    });

    const replicas = [];

    if (!replicaConnections.length) {
        replicas.push(
            DrizzlePostgres(primaryPool, {
                logger: process.env.QUERY_LOGGING == "true"
            })
        );
    } else {
        for (const conn of replicaConnections) {
            const replicaPool = new Pool({
                connectionString: conn.connection_string,
                max: poolConfig?.max_replica_connections || 20,
                idleTimeoutMillis: poolConfig?.idle_timeout_ms || 30000,
                connectionTimeoutMillis:
                    poolConfig?.connection_timeout_ms || 5000
            });
            replicas.push(
                DrizzlePostgres(replicaPool, {
                    logger: process.env.QUERY_LOGGING == "true"
                })
            );
        }
    }

    return withReplicas(
        DrizzlePostgres(primaryPool, {
            logger: process.env.QUERY_LOGGING == "true"
        }),
        replicas as any
    );
}

export const logsDb = createLogsDb();
export default logsDb;
export const primaryLogsDb = logsDb.$primary;