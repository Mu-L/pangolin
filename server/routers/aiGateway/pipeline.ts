import { Request, Response } from "express";
import { and, eq, inArray } from "drizzle-orm";
import {
    AiProvider,
    aiModels,
    aiProviders,
    clients,
    db,
    exitNodes,
    resourceAiModels,
    resourceAiProviders,
    resources,
    siteResourceAiModels,
    siteResourceAiProviders,
    siteResources,
    users
} from "@server/db";
import config from "@server/lib/config";
import { decrypt } from "@server/lib/crypto";
import {
    AiProviderAuthType,
    applyAiProviderAuthHeaders,
    applyAiProviderCustomHeaders,
    authTypeRequiresApiKey
} from "@server/lib/aiProviderDefaults";
import {
    AI_CAPABILITY_DEFS,
    providerHasCapability,
    type AiCapability
} from "@server/lib/aiCapabilities";
import { proxyAiGatewayToSiteTarget } from "@server/routers/aiGateway/targetRouting";
import {
    SESSION_COOKIE_NAME,
    validateSessionToken
} from "@server/auth/sessions/app";
import { getUserOrgRoles } from "@server/lib/userOrgRoles";
import { isIpInCidr } from "@server/lib/ip";
import { localCache } from "@server/lib/cache";
import logger from "@server/logger";
import HttpCode from "@server/types/HttpCode";
import {
    resolveEffectiveLists,
    type AccessMode,
    type ModelListType
} from "@server/lib/aiInferenceResource";
import {
    compareModelKeySpecificity,
    isAllowedByLists,
    mostSpecificMatchingAllow
} from "@server/lib/aiModelKeyMatch";
import { aiGatewayUpstreamFetch } from "@server/lib/aiGatewayUpstreamFetch";

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

type ProviderAttachment = {
    provider: AiProvider;
    accessMode: AccessMode;
};

type ResourceModelPattern = {
    providerId: number;
    modelKey: string;
    listType: ModelListType;
    enabled: boolean;
};

type ProviderPatternLists = {
    allows: string[];
    blocks: string[];
};

type ResolvedTarget = {
    resourceId: number | null;
    siteResourceId: number | null;
    orgId: string | null;
    attachments: ProviderAttachment[];
    resourceListsByProvider: Map<number, ProviderPatternLists>;
};

type ProviderSelection =
    | { ok: true; provider: AiProvider }
    | { ok: false; status: number; message: string };

export type RequestUser = {
    userId: string;
    username: string;
    email: string | null;
    name: string | null;
    role: string | null;
};

// Identity headers forwarded to the upstream inference endpoint when the
// requesting user is known. Omitted entirely (not sent empty) when we
// couldn't resolve a user for the request.
export function applyRequestUserHeaders(
    headers: Record<string, string>,
    requestUser: RequestUser | null
): void {
    if (!requestUser) {
        return;
    }
    headers["Remote-User"] = requestUser.username;
    if (requestUser.email) {
        headers["Remote-Email"] = requestUser.email;
    }
    if (requestUser.name) {
        headers["Remote-Name"] = requestUser.name;
    }
    if (requestUser.role) {
        headers["Remote-Role"] = requestUser.role;
    }
}

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
    _resourceId: number | null,
    orgId: string | null
): Promise<RequestUser | null> {
    const sessionToken = req.cookies?.[SESSION_COOKIE_NAME];
    if (sessionToken) {
        const { session, user } = await validateSessionToken(sessionToken);
        if (session && user) {
            return buildRequestUser(user.userId, orgId);
        }
    }

    // TODO: MAKE SURE THIS CAN NOT BE SPOOFED AND CAN BE TRUSTED AS AN INTERNAL ADDRESS FROM A NODE

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
            orgId: resources.orgId
        })
        .from(resources)
        .where(
            and(
                eq(resources.fullDomain, host),
                eq(resources.mode, "inference"),
                eq(resources.enabled, true)
            )
        )
        .limit(1);

    if (resourceRow) {
        const attachmentRows = await db
            .select({
                provider: aiProviders,
                accessMode: resourceAiProviders.accessMode
            })
            .from(resourceAiProviders)
            .innerJoin(
                aiProviders,
                eq(resourceAiProviders.providerId, aiProviders.providerId)
            )
            .where(
                and(
                    eq(resourceAiProviders.resourceId, resourceRow.resourceId),
                    eq(aiProviders.enabled, true)
                )
            );

        if (attachmentRows.length === 0) {
            return null;
        }

        const attachments: ProviderAttachment[] = attachmentRows.map((a) => ({
            provider: a.provider,
            accessMode: a.accessMode
        }));

        const resourcePatterns = await db
            .select({
                providerId: aiModels.providerId,
                modelKey: aiModels.modelKey,
                listType: resourceAiModels.listType,
                enabled: aiModels.enabled
            })
            .from(resourceAiModels)
            .innerJoin(aiModels, eq(resourceAiModels.modelId, aiModels.modelId))
            .where(eq(resourceAiModels.resourceId, resourceRow.resourceId));

        return {
            resourceId: resourceRow.resourceId,
            siteResourceId: null,
            orgId: resourceRow.orgId,
            attachments,
            resourceListsByProvider: groupPatternsByProvider(resourcePatterns)
        };
    }

    const [siteResourceRow] = await db
        .select({
            siteResourceId: siteResources.siteResourceId,
            orgId: siteResources.orgId
        })
        .from(siteResources)
        .where(
            and(
                eq(siteResources.fullDomain, host),
                eq(siteResources.mode, "inference"),
                eq(siteResources.enabled, true)
            )
        )
        .limit(1);

    if (siteResourceRow) {
        const attachmentRows = await db
            .select({
                provider: aiProviders,
                accessMode: siteResourceAiProviders.accessMode
            })
            .from(siteResourceAiProviders)
            .innerJoin(
                aiProviders,
                eq(siteResourceAiProviders.providerId, aiProviders.providerId)
            )
            .where(
                and(
                    eq(
                        siteResourceAiProviders.siteResourceId,
                        siteResourceRow.siteResourceId
                    ),
                    eq(aiProviders.enabled, true)
                )
            );

        if (attachmentRows.length === 0) {
            return null;
        }

        const attachments: ProviderAttachment[] = attachmentRows.map((a) => ({
            provider: a.provider,
            accessMode: a.accessMode
        }));

        const resourcePatterns = await db
            .select({
                providerId: aiModels.providerId,
                modelKey: aiModels.modelKey,
                listType: siteResourceAiModels.listType,
                enabled: aiModels.enabled
            })
            .from(siteResourceAiModels)
            .innerJoin(
                aiModels,
                eq(siteResourceAiModels.modelId, aiModels.modelId)
            )
            .where(
                eq(
                    siteResourceAiModels.siteResourceId,
                    siteResourceRow.siteResourceId
                )
            );

        return {
            resourceId: null,
            siteResourceId: siteResourceRow.siteResourceId,
            orgId: siteResourceRow.orgId,
            attachments,
            resourceListsByProvider: groupPatternsByProvider(resourcePatterns)
        };
    }

    return null;
}

function groupPatternsByProvider(
    patterns: ResourceModelPattern[]
): Map<number, ProviderPatternLists> {
    const byProvider = new Map<number, ProviderPatternLists>();
    for (const pattern of patterns) {
        if (!pattern.enabled) {
            continue;
        }
        let lists = byProvider.get(pattern.providerId);
        if (!lists) {
            lists = { allows: [], blocks: [] };
            byProvider.set(pattern.providerId, lists);
        }
        if (pattern.listType === "allow") {
            lists.allows.push(pattern.modelKey);
        } else {
            lists.blocks.push(pattern.modelKey);
        }
    }
    return byProvider;
}

async function selectProvider(
    attachments: ProviderAttachment[],
    resourceListsByProvider: Map<number, ProviderPatternLists>,
    requestedModel: string | undefined
): Promise<ProviderSelection> {
    if (!requestedModel) {
        return {
            ok: false,
            status: HttpCode.FORBIDDEN,
            message: "A model must be specified for this resource"
        };
    }

    const attachmentByProviderId = new Map(
        attachments.map((a) => [a.provider.providerId, a])
    );
    const providerIds = [...attachmentByProviderId.keys()];
    if (providerIds.length === 0) {
        return {
            ok: false,
            status: HttpCode.FORBIDDEN,
            message: `Model "${requestedModel}" is not permitted on this resource`
        };
    }

    const providerModels = await db
        .select({
            providerId: aiModels.providerId,
            modelKey: aiModels.modelKey,
            listType: aiModels.listType,
            enabled: aiModels.enabled
        })
        .from(aiModels)
        .where(inArray(aiModels.providerId, providerIds));

    const allowsByProvider = new Map<number, string[]>();
    const blocksByProvider = new Map<number, string[]>();
    for (const model of providerModels) {
        if (!model.enabled) {
            continue;
        }
        const targetMap =
            model.listType === "allow" ? allowsByProvider : blocksByProvider;
        const existing = targetMap.get(model.providerId) ?? [];
        existing.push(model.modelKey);
        targetMap.set(model.providerId, existing);
    }

    type ModelCandidate = {
        provider: AiProvider;
        modelKey: string;
    };

    const candidates: ModelCandidate[] = [];
    for (const [providerId, attachment] of attachmentByProviderId) {
        const resourceLists = resourceListsByProvider.get(providerId);
        const { allows, blocks } = resolveEffectiveLists({
            accessMode: attachment.accessMode,
            providerAllows: allowsByProvider.get(providerId) ?? [],
            providerBlocks: blocksByProvider.get(providerId) ?? [],
            resourceAllows: resourceLists?.allows ?? [],
            resourceBlocks: resourceLists?.blocks ?? []
        });

        if (!isAllowedByLists(requestedModel, allows, blocks)) {
            continue;
        }
        const matchingAllow = mostSpecificMatchingAllow(requestedModel, allows);
        if (!matchingAllow) {
            continue;
        }
        candidates.push({
            provider: attachment.provider,
            modelKey: matchingAllow
        });
    }

    if (candidates.length === 0) {
        return {
            ok: false,
            status: HttpCode.FORBIDDEN,
            message: `Model "${requestedModel}" is not permitted on this resource`
        };
    }

    candidates.sort((a, b) =>
        compareModelKeySpecificity(a.modelKey, b.modelKey)
    );

    const bestSpecificity = candidates[0].modelKey;
    const topCandidates = candidates.filter(
        (c) => compareModelKeySpecificity(c.modelKey, bestSpecificity) === 0
    );

    const uniqueProviders = new Map<number, AiProvider>();
    for (const candidate of topCandidates) {
        uniqueProviders.set(candidate.provider.providerId, candidate.provider);
    }

    if (uniqueProviders.size === 1) {
        return { ok: true, provider: [...uniqueProviders.values()][0] };
    }

    return {
        ok: false,
        status: HttpCode.FORBIDDEN,
        message: `Model "${requestedModel}" is ambiguous across multiple AI providers on this resource`
    };
}

export async function handleAiGatewayProxy(
    req: Request,
    res: Response,
    capability: AiCapability
): Promise<any> {
    try {
        const def = AI_CAPABILITY_DEFS[capability];

        const host = (
            (req.headers["p-host"] as string | undefined) || // p-host is only used sometimes when overriding the host header for some middleware proxy
            req.headers.host ||
            ""
        ).split(":")[0];
        if (!host) {
            return res
                .status(HttpCode.BAD_REQUEST)
                .json({ error: { message: "Missing Host header" } });
        }

        logger.info(`AI gateway ${capability} request for host: ${host}`);

        const target = await resolveTarget(host);
        if (!target) {
            return res.status(HttpCode.NOT_FOUND).json({
                error: {
                    message: "No inference resource found for this host"
                }
            });
        }

        const { attachments, resourceListsByProvider, resourceId, orgId } =
            target;

        const requestUser = await resolveRequestUser(req, resourceId, orgId);
        if (requestUser) {
            logger.debug(
                `AI gateway request from user ${requestUser.userId} (${requestUser.username})`
            );
        }

        const capableAttachments = attachments.filter((a) =>
            providerHasCapability(a.provider.capabilities, capability)
        );

        if (capableAttachments.length === 0) {
            return res.status(HttpCode.FORBIDDEN).json({
                error: {
                    message: `No AI provider on this resource supports ${capability}`
                }
            });
        }

        const requestedModel = def.extractModel(req);

        const selection = await selectProvider(
            capableAttachments,
            resourceListsByProvider,
            requestedModel
        );
        if (!selection.ok) {
            return res.status(selection.status).json({
                error: { message: selection.message }
            });
        }

        const { provider } = selection;

        if (provider.type === "custom" && provider.routingMode === "target") {
            return await proxyAiGatewayToSiteTarget(
                req,
                res,
                provider,
                requestUser
            );
        }

        const upstreamUrl = provider.upstreamUrl;
        const authType = provider.authType as AiProviderAuthType;

        if (!upstreamUrl) {
            return res.status(HttpCode.INTERNAL_SERVER_ERROR).json({
                error: {
                    message: "AI provider has no upstream URL configured"
                }
            });
        }

        let apiKey: string | null = null;
        if (authTypeRequiresApiKey(authType)) {
            if (!provider.apiKey) {
                return res.status(HttpCode.INTERNAL_SERVER_ERROR).json({
                    error: {
                        message: "AI provider has no API key configured"
                    }
                });
            }
            const secret = config.getRawConfig().server.secret!;
            apiKey = decrypt(provider.apiKey, secret);
        }

        const targetUrl = def.resolveUpstreamUrl(
            upstreamUrl,
            req,
            requestedModel!
        );

        const skipHeaders = new Set([
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

        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.headers)) {
            if (skipHeaders.has(key.toLowerCase()) || value === undefined) {
                continue;
            }
            headers[key] = Array.isArray(value) ? value.join(", ") : value;
        }
        applyAiProviderCustomHeaders(
            headers,
            provider.headers,
            config.getRawConfig().server.secret!
        );
        applyAiProviderAuthHeaders(headers, authType, apiKey);
        applyRequestUserHeaders(headers, requestUser);

        const body = JSON.stringify(req.body);

        logger.debug("AI gateway upstream request", {
            capability,
            url: targetUrl,
            method: "POST",
            headers,
            body: req.body,
            skipTlsVerification: provider.skipTlsVerification
        });

        // Cancel the upstream request (and, transitively, anything it fans
        // out to) if the client goes away before we're done - otherwise a
        // client-cancelled streaming chat completion keeps running upstream
        // to completion, wasting the connection and any per-token billing.
        const abortController = new AbortController();
        const onClientClose = () => {
            if (!res.writableEnded) {
                abortController.abort();
            }
        };
        res.on("close", onClientClose);

        let upstreamRes: globalThis.Response;
        try {
            upstreamRes = await aiGatewayUpstreamFetch(targetUrl, {
                method: "POST",
                headers,
                body,
                skipTlsVerification: provider.skipTlsVerification,
                signal: abortController.signal
            });
        } catch (fetchError) {
            res.off("close", onClientClose);
            if (abortController.signal.aborted) {
                // Client already disconnected; nothing left to respond to.
                return;
            }
            logger.error({
                message: "AI gateway upstream fetch failed",
                url: targetUrl,
                error: fetchError,
                cause:
                    fetchError instanceof Error
                        ? (fetchError as Error & { cause?: unknown }).cause
                        : undefined
            });
            throw fetchError;
        }

        const contentType = upstreamRes.headers.get("content-type") || "";
        const isStream =
            req.body?.stream === true ||
            contentType.includes("text/event-stream") ||
            req.path.includes("streamGenerateContent") ||
            req.path.includes("streamRawPredict") ||
            req.path.includes("converse-stream") ||
            req.path.includes("invoke-with-response-stream");

        res.status(upstreamRes.status);
        res.setHeader("Content-Type", contentType || "application/json");

        if (isStream && upstreamRes.body) {
            res.flushHeaders();
            const reader = upstreamRes.body.getReader();
            try {
                while (!abortController.signal.aborted) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    res.write(value);
                }
            } finally {
                await reader.cancel().catch(() => {});
                res.off("close", onClientClose);
            }
            if (!res.writableEnded) {
                res.end();
            }
            return;
        }

        res.off("close", onClientClose);
        const text = await upstreamRes.text();
        return res.send(text);
    } catch (error) {
        logger.error(error);
        return res.status(HttpCode.INTERNAL_SERVER_ERROR).json({
            error: { message: "Failed to proxy inference request" }
        });
    }
}
