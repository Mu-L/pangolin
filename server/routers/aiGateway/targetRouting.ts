import { Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { AiProvider, db, exitNodes, sites, targets } from "@server/db";
import { localCache } from "@server/lib/cache";
import logger from "@server/logger";
import HttpCode from "@server/types/HttpCode";

// Short TTL: long enough to spare the DB on a burst of requests, short
// enough that target/site changes (added, removed, exit node moved) show up
// almost immediately without needing explicit cache invalidation.
const PROVIDER_TARGETS_TTL_SEC = 7;

// Header gerbil reads to know which host:port (reachable over the
// WireGuard network) to rewrite an incoming /router/* request to. Must
// match gerbil's `pangolinDestHeader` constant.
const PANGOLIN_DEST_HEADER = "p-dest-header";

const SKIP_HEADERS = new Set([
    "p-host",
    "host",
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "content-length",
    "accept-encoding"
]);

type ResolvedProviderTarget = {
    targetId: number;
    // "<site exitNodeSubnet host>:<internalPort>", passed to gerbil as the
    // destination to proxy the request to over the WireGuard tunnel.
    destination: string;
    // The target's site's exit node HTTP API base URL (gerbil's /router/*).
    gerbilBaseUrl: string;
};

async function fetchProviderTargets(
    providerId: number
): Promise<ResolvedProviderTarget[]> {
    const rows = await db
        .select({
            targetId: targets.targetId,
            internalPort: targets.internalPort,
            port: targets.port,
            exitNodeSubnet: sites.exitNodeSubnet,
            reachableAt: exitNodes.reachableAt
        })
        .from(targets)
        .innerJoin(sites, eq(targets.siteId, sites.siteId))
        .innerJoin(exitNodes, eq(sites.exitNodeId, exitNodes.exitNodeId))
        .where(
            and(eq(targets.providerId, providerId), eq(targets.enabled, true))
        );

    const resolved: ResolvedProviderTarget[] = [];
    for (const row of rows) {
        // Sites not yet connected to an exit node (no subnet assigned) or
        // whose exit node has no known HTTP address can't be routed to.
        if (!row.exitNodeSubnet || !row.reachableAt) {
            continue;
        }
        const host = row.exitNodeSubnet.split("/")[0];
        const port = row.internalPort ?? row.port;
        resolved.push({
            targetId: row.targetId,
            destination: `${host}:${port}`,
            gerbilBaseUrl: row.reachableAt
        });
    }

    return resolved;
}

async function getProviderTargets(
    providerId: number
): Promise<ResolvedProviderTarget[]> {
    const cacheKey = `aiGateway:providerTargets:${providerId}`;
    const cached = localCache.get<ResolvedProviderTarget[]>(cacheKey);
    if (cached !== undefined) {
        return cached;
    }

    const resolved = await fetchProviderTargets(providerId);
    localCache.set(cacheKey, resolved, PROVIDER_TARGETS_TTL_SEC);
    return resolved;
}

// Round-robin cursor per provider. Process-local and unpersisted - fine
// since it only needs to spread load across targets, not guarantee a
// perfectly even distribution across restarts or multiple server instances.
const roundRobinCursors = new Map<number, number>();

function pickTarget(
    providerId: number,
    providerTargets: ResolvedProviderTarget[]
): ResolvedProviderTarget {
    const cursor = roundRobinCursors.get(providerId) ?? 0;
    roundRobinCursors.set(providerId, cursor + 1);
    return providerTargets[cursor % providerTargets.length];
}

function pathFromRequest(req: Request): string {
    const raw =
        req.originalUrl?.split("?")[0] || req.url?.split("?")[0] || req.path;
    return raw.startsWith("/") ? raw : `/${raw}`;
}

/**
 * Proxies an AI gateway request to one of a "custom" / "target" routing-mode
 * provider's site targets, via that site's gerbil sidecar. Gerbil's
 * /router/* endpoint forwards the request (untouched body, same path minus
 * the /router prefix, and all headers besides PANGOLIN_DEST_HEADER) over the
 * WireGuard tunnel to the destination named in that header. Always writes a
 * response to `res`, including on failure.
 */
export async function proxyAiGatewayToSiteTarget(
    req: Request,
    res: Response,
    provider: AiProvider
): Promise<void> {
    const providerTargets = await getProviderTargets(provider.providerId);
    if (providerTargets.length === 0) {
        res.status(HttpCode.INTERNAL_SERVER_ERROR).json({
            error: {
                message:
                    "AI provider has no reachable site targets configured"
            }
        });
        return;
    }

    const target = pickTarget(provider.providerId, providerTargets);
    const gerbilUrl = `${target.gerbilBaseUrl.replace(/\/+$/, "")}/router${pathFromRequest(req)}`;

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
        if (SKIP_HEADERS.has(key.toLowerCase()) || value === undefined) {
            continue;
        }
        headers[key] = Array.isArray(value) ? value.join(", ") : value;
    }
    headers[PANGOLIN_DEST_HEADER] = target.destination;

    const body = JSON.stringify(req.body);

    logger.debug("AI gateway target-routed request", {
        providerId: provider.providerId,
        targetId: target.targetId,
        destination: target.destination,
        url: gerbilUrl
    });

    let upstreamRes: globalThis.Response;
    try {
        upstreamRes = await fetch(gerbilUrl, {
            method: "POST",
            headers,
            body
        });
    } catch (fetchError) {
        logger.error({
            message: "AI gateway target proxy request failed",
            url: gerbilUrl,
            targetId: target.targetId,
            error: fetchError,
            cause:
                fetchError instanceof Error
                    ? (fetchError as Error & { cause?: unknown }).cause
                    : undefined
        });
        res.status(HttpCode.BAD_GATEWAY).json({
            error: { message: "Failed to reach AI provider target" }
        });
        return;
    }

    const contentType = upstreamRes.headers.get("content-type") || "";
    const isStream =
        req.body?.stream === true ||
        contentType.includes("text/event-stream");

    res.status(upstreamRes.status);
    res.setHeader("Content-Type", contentType || "application/json");

    if (isStream && upstreamRes.body) {
        res.flushHeaders();
        const reader = upstreamRes.body.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
        }
        res.end();
        return;
    }

    const text = await upstreamRes.text();
    res.send(text);
}
