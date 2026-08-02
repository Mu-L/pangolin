import { Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import {
    AiProvider,
    aiModels,
    aiProviders,
    db,
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
import logger from "@server/logger";
import HttpCode from "@server/types/HttpCode";

type ResolvedTarget = {
    resourceId: number | null;
    orgId: string | null;
    provider: AiProvider;
    // null = no restriction; every enabled model on the provider is allowed
    allowedModelIds: number[] | null;
};

// Fallback for clients that hit the endpoint directly (e.g. an AI tool's
// "API key" field) instead of going through a browser session - badger
// forwards whatever Authorization header the client sent untouched in that
// case. This prefix lets us tell "this bearer value is a Pangolin resource
// access token" apart from an arbitrary/opaque API key a user might paste
// in, without guessing based on format alone.
const USER_TOKEN_PREFIX = "pu_";

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
    const [user] = await db
        .select()
        .from(users)
        .where(eq(users.userId, userId))
        .limit(1);

    if (!user) {
        return null;
    }

    const orgRoles = orgId ? await getUserOrgRoles(user.userId, orgId) : [];

    return {
        userId: user.userId,
        username: user.username,
        email: user.email,
        name: user.name,
        role: orgRoles.map((r) => r.roleName).join(", ") || null
    };
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

    // User devices hitting the endpoint directly (no browser session to
    // forward) fall back to a Pangolin resource access token passed as the
    // client's "API key".
    const authHeader = req.headers["authorization"];
    if (typeof authHeader !== "string" || !resourceId) {
        return null;
    }

    const bearer = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!bearer || !bearer.startsWith(USER_TOKEN_PREFIX)) {
        return null;
    }

    const [accessTokenId, accessToken] = bearer
        .slice(USER_TOKEN_PREFIX.length)
        .split(".");
    if (!accessTokenId || !accessToken) {
        return null;
    }

    const { valid, tokenItem } = await verifyResourceAccessToken({
        accessToken,
        accessTokenId,
        resourceId
    });

    if (!valid || !tokenItem?.userId) {
        return null;
    }

    return buildRequestUser(tokenItem.userId, tokenItem.orgId);
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

export async function chatCompletions(req: Request, res: Response): Promise<any> {
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
