import { Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import {
    AiProvider,
    aiModels,
    aiProviders,
    clients,
    db,
    exitNodes,
    resourceAiModels,
    resources,
    siteResourceAiModels,
    siteResources,
    users
} from "@server/db";
import config from "@server/lib/config";
import { decrypt } from "@server/lib/crypto";
import {
    AiProviderAuthType,
    AiProviderRoutingMode,
    AiProviderType,
    resolveAiProviderConfig
} from "@server/lib/aiProviderDefaults";
import { verifyResourceAccessToken } from "@server/auth/verifyResourceAccessToken";
import {
    SESSION_COOKIE_NAME,
    validateSessionToken
} from "@server/auth/sessions/app";
import { getUserOrgRoles } from "@server/lib/userOrgRoles";
import { isIpInCidr } from "@server/lib/ip";
import { localCache } from "@server/lib/cache";
import logger from "@server/logger";
import HttpCode from "@server/types/HttpCode";

// Short-lived local caches so a burst of requests from the same IP/user
// doesn't hit the database on every single request. None of this is
// security-critical to cache aggressively (identity is re-derived from the
// session cookie or from a client's exit-node-scoped subnet each time), so
// a small TTL is just an efficiency win, not a trust boundary.
const EXIT_NODE_RANGES_CACHE_KEY = "aiGateway:exitNodeRanges";
const EXIT_NODE_RANGES_TTL_SEC = 6000;
const CLIENT_BY_IP_TTL_SEC = 30;
const REQUEST_USER_TTL_SEC = 30;

type CachedClient = { clientId: number; userId: string | null } | null;

// The set of CIDRs an exit node manages; client exitNodeSubnets are always
// /32s carved out of one of these ranges. Checking against this small,
// cacheable list lets us skip the (much more frequent) per-IP client lookup
// entirely for traffic that could never match a client anyway.
async function getExitNodeRanges(): Promise<string[]> {
    const cached = localCache.get<string[]>(EXIT_NODE_RANGES_CACHE_KEY);
    if (cached) {
        return cached;
    }

    const rows = await db
        .select({ address: exitNodes.address })
        .from(exitNodes);
    const ranges = rows.map((r) => r.address);

    localCache.set(
        EXIT_NODE_RANGES_CACHE_KEY,
        ranges,
        EXIT_NODE_RANGES_TTL_SEC
    );
    return ranges;
}

async function findClientByIp(ip: string): Promise<CachedClient> {
    const cacheKey = `aiGateway:clientByIp:${ip}`;
    const cached = localCache.get<CachedClient>(cacheKey);
    if (cached !== undefined) {
        return cached;
    }

    const [client] = await db
        .select({ clientId: clients.clientId, userId: clients.userId })
        .from(clients)
        .where(eq(clients.exitNodeSubnet, `${ip}/32`))
        .limit(1);

    const result: CachedClient = client || null;
    localCache.set(cacheKey, result, CLIENT_BY_IP_TTL_SEC);
    return result;
}

type ResolvedTarget = {
    resourceId: number | null;
    orgId: string | null;
    provider: AiProvider;
    // null = no restriction; every enabled model on the provider is allowed
    allowedModelIds: number[] | null;
};

export type RequestUser = {
    userId: string;
    username: string;
    email: string | null;
    name: string | null;
    role: string | null;
};

async function buildRequestUser(
    userId: string,
    orgId: string | null
): Promise<RequestUser | null> {
    const cacheKey = `aiGateway:requestUser:${userId}:${orgId || ""}`;
    const cached = localCache.get<RequestUser | null>(cacheKey);
    if (cached !== undefined) {
        return cached;
    }

    const [user] = await db
        .select()
        .from(users)
        .where(eq(users.userId, userId))
        .limit(1);

    if (!user) {
        localCache.set(cacheKey, null, REQUEST_USER_TTL_SEC);
        return null;
    }

    const orgRoles = orgId ? await getUserOrgRoles(user.userId, orgId) : [];

    const requestUser: RequestUser = {
        userId: user.userId,
        username: user.username,
        email: user.email,
        name: user.name,
        role: orgRoles.map((r) => r.roleName).join(", ") || null
    };

    localCache.set(cacheKey, requestUser, REQUEST_USER_TTL_SEC);
    return requestUser;
}

async function resolveRequestUser(
    req: Request,
    resourceId: number | null,
    orgId: string | null
): Promise<RequestUser | null> {
    // Public resources behind badger: badger passes the resource session
    // cookie through to the backend (same mechanism the browser gateway,
    // e.g. the SSH page, relies on), so we can validate it exactly like
    // verifySessionUserMiddleware does for the dashboard.
    const sessionToken = req.cookies?.[SESSION_COOKIE_NAME];
    if (sessionToken) {
        const { session, user } = await validateSessionToken(sessionToken);
        if (session && user) {
            return buildRequestUser(user.userId, orgId);
        }
    }

    // TODO: MAKE SURE THIS CAN NOT BE SPOOFED AND CAN BE TRUSTED AS AN INTERNAL ADDRESS FROM A NODE

    // No session cookie - fall back to identifying the caller by source IP.
    // A client's exitNodeSubnet is a /32 handed out from one of our exit
    // node's address ranges, so an IP that isn't inside any of those ranges
    // can never belong to a client and we can skip the DB entirely.
    const ip = req.ip;
    if (!ip) {
        return null;
    }

    const exitNodeRanges = await getExitNodeRanges();
    const inExitNodeRange = exitNodeRanges.some((range) =>
        isIpInCidr(ip, range)
    );
    if (!inExitNodeRange) {
        return null;
    }

    const client = await findClientByIp(ip);
    if (!client || !client.userId) {
        return null;
    }

    return buildRequestUser(client.userId, orgId);
}

async function resolveTarget(host: string): Promise<ResolvedTarget | null> {
    const [resourceRow] = await db
        .select({
            resourceId: resources.resourceId,
            orgId: resources.orgId,
            provider: aiProviders
        })
        .from(resources)
        .innerJoin(
            aiProviders,
            eq(resources.aiProviderId, aiProviders.providerId)
        )
        .where(
            and(
                eq(resources.fullDomain, host),
                eq(resources.mode, "inference"),
                eq(resources.enabled, true),
                eq(aiProviders.enabled, true)
            )
        )
        .limit(1);

    if (resourceRow) {
        const restrictions = await db
            .select({ modelId: resourceAiModels.modelId })
            .from(resourceAiModels)
            .where(eq(resourceAiModels.resourceId, resourceRow.resourceId));

        return {
            resourceId: resourceRow.resourceId,
            orgId: resourceRow.orgId,
            provider: resourceRow.provider,
            allowedModelIds: restrictions.length
                ? restrictions.map((r) => r.modelId)
                : null
        };
    }

    const [siteResourceRow] = await db
        .select({
            siteResourceId: siteResources.siteResourceId,
            orgId: siteResources.orgId,
            provider: aiProviders
        })
        .from(siteResources)
        .innerJoin(
            aiProviders,
            eq(siteResources.aiProviderId, aiProviders.providerId)
        )
        .where(
            and(
                eq(siteResources.alias, host),
                eq(siteResources.mode, "inference"),
                eq(siteResources.enabled, true),
                eq(aiProviders.enabled, true)
            )
        )
        .limit(1);

    if (siteResourceRow) {
        const restrictions = await db
            .select({ modelId: siteResourceAiModels.modelId })
            .from(siteResourceAiModels)
            .where(
                eq(
                    siteResourceAiModels.siteResourceId,
                    siteResourceRow.siteResourceId
                )
            );

        return {
            // siteResources have no per-user auth/policy stack today (see
            // the routing comment in getTraefikConfig.ts), so there's no
            // resource access token scope to validate a user token against.
            resourceId: null,
            orgId: siteResourceRow.orgId,
            provider: siteResourceRow.provider,
            allowedModelIds: restrictions.length
                ? restrictions.map((r) => r.modelId)
                : null
        };
    }

    return null;
}

// Generic OpenAI-wire-compatible passthrough. Anthropic's native API uses a
// different path/schema; everything else here is OpenAI-compatible today.
function getCompletionsPath(type: AiProviderType): string {
    if (type === "anthropic") {
        return "/v1/messages";
    }
    return "/chat/completions";
}

export async function chatCompletions(
    req: Request,
    res: Response
): Promise<any> {
    try {
        const host = (req.headers.host || "").split(":")[0];
        if (!host) {
            return res
                .status(HttpCode.BAD_REQUEST)
                .json({ error: { message: "Missing Host header" } });
        }

        const target = await resolveTarget(host);
        if (!target) {
            return res.status(HttpCode.NOT_FOUND).json({
                error: {
                    message: "No inference resource found for this host"
                }
            });
        }

        const { provider, allowedModelIds, resourceId, orgId } = target;

        // Best-effort identity resolution - not yet enforced, but lets us
        // start making per-user access decisions (e.g. model/role-based
        // restrictions) without another round of plumbing later.
        const requestUser = await resolveRequestUser(req, resourceId, orgId);
        if (requestUser) {
            logger.debug(
                `AI gateway request from user ${requestUser.userId} (${requestUser.username})`
            );
        }

        const requestedModel =
            typeof req.body?.model === "string" ? req.body.model : undefined;

        if (allowedModelIds) {
            if (!requestedModel) {
                return res.status(HttpCode.FORBIDDEN).json({
                    error: {
                        message:
                            "This resource restricts access to specific models; a model must be specified"
                    }
                });
            }

            const [matchedModel] = await db
                .select({ modelId: aiModels.modelId })
                .from(aiModels)
                .where(
                    and(
                        eq(aiModels.providerId, provider.providerId),
                        eq(aiModels.modelKey, requestedModel)
                    )
                )
                .limit(1);

            if (
                !matchedModel ||
                !allowedModelIds.includes(matchedModel.modelId)
            ) {
                return res.status(HttpCode.FORBIDDEN).json({
                    error: {
                        message: `Model "${requestedModel}" is not permitted on this resource`
                    }
                });
            }
        }

        if (!provider.apiKey) {
            return res.status(HttpCode.INTERNAL_SERVER_ERROR).json({
                error: { message: "AI provider has no API key configured" }
            });
        }

        const secret = config.getRawConfig().server.secret!;
        const apiKey = decrypt(provider.apiKey, secret);

        const { upstreamUrl, authType } = resolveAiProviderConfig({
            type: provider.type as AiProviderType,
            upstreamUrl: provider.upstreamUrl,
            authType: provider.authType as AiProviderAuthType | null,
            routingMode: provider.routingMode as AiProviderRoutingMode | null
        });

        if (!upstreamUrl) {
            return res.status(HttpCode.INTERNAL_SERVER_ERROR).json({
                error: {
                    message: "AI provider has no upstream URL configured"
                }
            });
        }

        const targetUrl = `${upstreamUrl.replace(/\/$/, "")}${getCompletionsPath(
            provider.type as AiProviderType
        )}`;

        const headers: Record<string, string> = {
            "Content-Type": "application/json"
        };
        if (authType === "bearer") {
            headers["Authorization"] = `Bearer ${apiKey}`;
        }

        // No dedicated per-request TLS agent is wired up (no extra deps for
        // this v1 gateway) - toggle the process-wide Node TLS check instead.
        // Known limitation: this is not safe under concurrent requests mixing
        // skipTlsVerification providers with strict ones.
        const restoreTlsReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        if (provider.skipTlsVerification) {
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
        }

        let upstreamRes: globalThis.Response;
        try {
            upstreamRes = await fetch(targetUrl, {
                method: "POST",
                headers,
                body: JSON.stringify(req.body)
            });
        } finally {
            if (provider.skipTlsVerification) {
                if (restoreTlsReject === undefined) {
                    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
                } else {
                    process.env.NODE_TLS_REJECT_UNAUTHORIZED = restoreTlsReject;
                }
            }
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
            return res.end();
        }

        const text = await upstreamRes.text();
        return res.send(text);
    } catch (error) {
        logger.error(error);
        return res.status(HttpCode.INTERNAL_SERVER_ERROR).json({
            error: { message: "Failed to proxy inference request" }
        });
    }
}
