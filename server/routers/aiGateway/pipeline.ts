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
    AiProviderType,
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
import { getModelPricing, calculateAiCost } from "@server/lib/aiModelPricing";
import {
    extractUsage,
    estimateUsage,
    isUsageEmpty,
    needsStreamUsageInjection,
    withStreamUsageOption,
    stripInjectedUsageFrame,
    extractResponseModel,
    type AiUsage
} from "@server/lib/aiUsageExtraction";

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
    const [[resourceRow], [siteResourceRow]] = await Promise.all([
        db
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
            .limit(1),
        db
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
            .limit(1)
    ]);

    // Prefer public inference resources when both match the same host.
    if (resourceRow) {
        const [attachmentRows, resourcePatterns] = await Promise.all([
            db
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
                        eq(
                            resourceAiProviders.resourceId,
                            resourceRow.resourceId
                        ),
                        eq(aiProviders.enabled, true),
                        eq(resourceAiProviders.enabled, true)
                    )
                ),
            db
                .select({
                    providerId: aiModels.providerId,
                    modelKey: aiModels.modelKey,
                    listType: resourceAiModels.listType,
                    enabled: aiModels.enabled
                })
                .from(resourceAiModels)
                .innerJoin(
                    aiModels,
                    eq(resourceAiModels.modelId, aiModels.modelId)
                )
                .where(eq(resourceAiModels.resourceId, resourceRow.resourceId))
        ]);

        if (attachmentRows.length === 0) {
            return null;
        }

        return {
            resourceId: resourceRow.resourceId,
            siteResourceId: null,
            orgId: resourceRow.orgId,
            attachments: attachmentRows.map((a) => ({
                provider: a.provider,
                accessMode: a.accessMode
            })),
            resourceListsByProvider: groupPatternsByProvider(resourcePatterns)
        };
    }

    if (siteResourceRow) {
        const [attachmentRows, resourcePatterns] = await Promise.all([
            db
                .select({
                    provider: aiProviders,
                    accessMode: siteResourceAiProviders.accessMode
                })
                .from(siteResourceAiProviders)
                .innerJoin(
                    aiProviders,
                    eq(
                        siteResourceAiProviders.providerId,
                        aiProviders.providerId
                    )
                )
                .where(
                    and(
                        eq(
                            siteResourceAiProviders.siteResourceId,
                            siteResourceRow.siteResourceId
                        ),
                        eq(aiProviders.enabled, true),
                        eq(siteResourceAiProviders.enabled, true)
                    )
                ),
            db
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
                )
        ]);

        if (attachmentRows.length === 0) {
            return null;
        }

        return {
            resourceId: null,
            siteResourceId: siteResourceRow.siteResourceId,
            orgId: siteResourceRow.orgId,
            attachments: attachmentRows.map((a) => ({
                provider: a.provider,
                accessMode: a.accessMode
            })),
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

function logAiUsageAndCost(args: {
    capability: AiCapability;
    provider: AiProvider;
    requestedModel: string | undefined;
    requestBody: unknown;
    responseText: string;
    isStream: boolean;
    headers: Headers;
}): void {
    const {
        capability,
        provider,
        requestedModel,
        requestBody,
        responseText,
        isStream,
        headers
    } = args;

    let usage: AiUsage | null = extractUsage(
        capability,
        responseText,
        isStream,
        headers
    );
    if (!usage || isUsageEmpty(usage)) {
        usage = estimateUsage(JSON.stringify(requestBody ?? ""), responseText);
    }

    const model = extractResponseModel(responseText) ?? requestedModel;
    const pricing = getModelPricing(provider.type as AiProviderType, model);
    const cost = calculateAiCost(pricing, usage);

    logger.info("AI gateway request usage", {
        capability,
        providerId: provider.providerId,
        providerType: provider.type,
        model,
        estimated: usage.estimated,
        promptTokens: usage.promptTokens,
        cacheReadTokens: usage.cacheReadTokens,
        cacheWriteTokens: usage.cacheWriteTokens,
        completionTokens: usage.completionTokens,
        reasoningTokens: usage.reasoningTokens,
        pricingApproximate: pricing?.approximate ?? null,
        totalCostUsd: cost?.totalCost ?? null
    });
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

        const [requestUser, selection] = await Promise.all([
            resolveRequestUser(req, resourceId, orgId),
            selectProvider(
                capableAttachments,
                resourceListsByProvider,
                requestedModel
            )
        ]);

        if (requestUser) {
            logger.debug(
                `AI gateway request from user ${requestUser.userId} (${requestUser.username})`
            );
        }

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
                requestUser,
                capability
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

        // OpenAI's Chat Completions API only reports usage in a streaming
        // response when asked to via stream_options.include_usage - inject
        // it ourselves when the caller didn't, so we can still track cost,
        // and strip the extra frame it adds back out of what we forward.
        const injectedUsageOurselves = needsStreamUsageInjection(
            capability,
            req.body
        );
        const outboundBody = injectedUsageOurselves
            ? withStreamUsageOption(req.body)
            : req.body;
        const body = JSON.stringify(outboundBody);

        logger.debug("AI gateway upstream request", {
            capability,
            url: targetUrl,
            method: "POST",
            headers,
            body: outboundBody,
            skipTlsVerification: provider.skipTlsVerification
        });

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
        const isStream = def.isStreaming(req, contentType);

        res.status(upstreamRes.status);
        res.setHeader("Content-Type", contentType || "application/json");

        if (isStream && upstreamRes.body) {
            res.flushHeaders();
            const reader = upstreamRes.body.getReader();
            const decoder = new TextDecoder();
            let fullText = "";
            // Frame-boundary buffer, only used when we need to filter the
            // usage-only frame we injected out of what reaches the client.
            let sseCarry = "";
            try {
                while (!abortController.signal.aborted) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunkText = decoder.decode(value, { stream: true });
                    fullText += chunkText;
                    if (injectedUsageOurselves) {
                        sseCarry += chunkText;
                        const lastBoundary = sseCarry.lastIndexOf("\n\n");
                        if (lastBoundary !== -1) {
                            const toEmit = sseCarry.slice(0, lastBoundary + 2);
                            sseCarry = sseCarry.slice(lastBoundary + 2);
                            res.write(stripInjectedUsageFrame(toEmit));
                        }
                    } else {
                        res.write(value);
                    }
                }
                if (injectedUsageOurselves && sseCarry) {
                    res.write(stripInjectedUsageFrame(sseCarry));
                }
            } finally {
                await reader.cancel().catch(() => {});
                res.off("close", onClientClose);
            }
            if (!res.writableEnded) {
                res.end();
            }
            if (!abortController.signal.aborted) {
                logAiUsageAndCost({
                    capability,
                    provider,
                    requestedModel,
                    requestBody: req.body,
                    responseText: fullText,
                    isStream: true,
                    headers: upstreamRes.headers
                });
            }
            return;
        }

        res.off("close", onClientClose);
        const text = await upstreamRes.text();
        logAiUsageAndCost({
            capability,
            provider,
            requestedModel,
            requestBody: req.body,
            responseText: text,
            isStream: false,
            headers: upstreamRes.headers
        });
        return res.send(text);
    } catch (error) {
        logger.error(error);
        return res.status(HttpCode.INTERNAL_SERVER_ERROR).json({
            error: { message: "Failed to proxy inference request" }
        });
    }
}
