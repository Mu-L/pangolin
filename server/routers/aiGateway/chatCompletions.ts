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
    siteResources
} from "@server/db";
import config from "@server/lib/config";
import { decrypt } from "@server/lib/crypto";
import {
    AiProviderAuthType,
    AiProviderRoutingMode,
    AiProviderType,
    resolveAiProviderConfig
} from "@server/lib/aiProviderDefaults";
import logger from "@server/logger";
import HttpCode from "@server/types/HttpCode";

type ResolvedTarget = {
    provider: AiProvider;
    // null = no restriction; every enabled model on the provider is allowed
    allowedModelIds: number[] | null;
};

async function resolveTarget(host: string): Promise<ResolvedTarget | null> {
    const [resourceRow] = await db
        .select({ resourceId: resources.resourceId, provider: aiProviders })
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
            provider: resourceRow.provider,
            allowedModelIds: restrictions.length
                ? restrictions.map((r) => r.modelId)
                : null
        };
    }

    const [siteResourceRow] = await db
        .select({
            siteResourceId: siteResources.siteResourceId,
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

        const { provider, allowedModelIds } = target;
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
