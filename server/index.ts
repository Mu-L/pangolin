#! /usr/bin/env node
import "./extendZod.ts";

import { runSetupFunctions } from "./setup";
import { createApiServer } from "./apiServer";
import { createNextServer } from "./nextServer";
import { createInternalServer } from "./internalServer";
import { createIntegrationApiServer } from "./integrationApiServer";
import {
    ApiKey,
    ApiKeyOrg,
    RemoteExitNode,
    Session,
    SiteResource,
    User,
    UserOrg
} from "@server/db";
import config from "@server/lib/config";
import { setHostMeta } from "@server/lib/hostMeta";
import { initTelemetryClient } from "@server/lib/telemetry";
import { TraefikConfigManager } from "@server/lib/traefik/TraefikConfigManager";
import { initCleanup } from "#dynamic/cleanup";
import license from "#dynamic/license/license";
import { initLogCleanupInterval } from "@server/lib/cleanupLogs";
import { initAcmeCertSync } from "#dynamic/lib/acmeCertSync";
import { fetchServerIp } from "@server/lib/serverIpService";
import logger from "@server/logger";

/**
 * Periodic memory usage logging for monitoring and leak detection.
 * Logs heap usage, external (native) memory, and RSS every 60 seconds.
 * This is lightweight (single process.memoryUsage() call) and provides
 * the data needed to detect slow memory growth over hours/days.
 */
function startMemoryMonitor(): void {
    const INTERVAL_MS = 60_000; // every 60 seconds
    const timer = setInterval(() => {
        const mem = process.memoryUsage();
        logger.info(
            `Memory usage - ` +
            `heapUsed: ${(mem.heapUsed / 1024 / 1024).toFixed(1)}MB, ` +
            `heapTotal: ${(mem.heapTotal / 1024 / 1024).toFixed(1)}MB, ` +
            `rss: ${(mem.rss / 1024 / 1024).toFixed(1)}MB, ` +
            `external: ${(mem.external / 1024 / 1024).toFixed(1)}MB, ` +
            `arrayBuffers: ${(mem.arrayBuffers / 1024 / 1024).toFixed(1)}MB`
        );
    }, INTERVAL_MS);
    timer.unref();
}

async function startServers() {
    await setHostMeta();

    await config.initServer();

    license.setServerSecret(config.getRawConfig().server.secret!);
    await license.check();

    await runSetupFunctions();

    await fetchServerIp();

    initTelemetryClient();

    initLogCleanupInterval();
    initAcmeCertSync();

    // Start memory monitoring for leak detection
    startMemoryMonitor();

    // Start all servers
    const apiServer = createApiServer();
    const internalServer = createInternalServer();

    const nextServer = await createNextServer();
    if (config.getRawConfig().traefik.file_mode) {
        const monitor = new TraefikConfigManager();
        await monitor.start();
    }

    let integrationServer;
    if (config.getRawConfig().flags?.enable_integration_api) {
        integrationServer = createIntegrationApiServer();
    }

    await initCleanup();

    return {
        apiServer,
        nextServer,
        internalServer,
        integrationServer
    };
}

// Types
declare global {
    namespace Express {
        interface Request {
            apiKey?: ApiKey;
            user?: User;
            session: Session;
            userOrg?: UserOrg;
            apiKeyOrg?: ApiKeyOrg;
            userOrgRoleIds?: number[];
            userOrgId?: string;
            userOrgIds?: string[];
            remoteExitNode?: RemoteExitNode;
            siteResource?: SiteResource;
            orgPolicyAllowed?: boolean;
        }
    }
}

startServers().catch(console.error);
