import type { Request } from "express";
import type { AiProviderType } from "@server/lib/aiProviderDefaults";

export const AI_CAPABILITIES = [
    "openai_chat",
    "openai_responses",
    "anthropic_messages",
    "gemini_generate_content",
    "bedrock_model_invoke",
    "google_generate_content",
    "google_raw_predict",
    "bedrock_converse"
] as const;

export type AiCapability = (typeof AI_CAPABILITIES)[number];

export type AiCapabilityRoute = {
    method: "POST";
    path: string;
};

export type AiCapabilityDefinition = {
    id: AiCapability;
    routes: AiCapabilityRoute[];
    extractModel: (req: Request) => string | undefined;
    resolveUpstreamUrl: (
        baseUrl: string,
        req: Request,
        model: string
    ) => string;
};

function bodyModel(req: Request): string | undefined {
    return typeof req.body?.model === "string" ? req.body.model : undefined;
}

function paramModel(req: Request): string | undefined {
    const model = req.params?.model;
    return typeof model === "string" && model.length > 0 ? model : undefined;
}

/**
 * Join base URL with a path, avoiding double slashes and a duplicated trailing
 * /v1 when the inbound path already starts with /v1 and the base ends with /v1.
 */
export function joinUpstreamUrl(baseUrl: string, path: string): string {
    const base = baseUrl.replace(/\/+$/, "");
    let suffix = path.startsWith("/") ? path : `/${path}`;

    if (
        base.endsWith("/v1") &&
        (suffix === "/v1" || suffix.startsWith("/v1/"))
    ) {
        suffix = suffix.slice("/v1".length) || "/";
    }

    if (suffix === "/") {
        return base;
    }

    return `${base}${suffix}`;
}

function pathFromRequest(req: Request): string {
    // Prefer originalUrl path (includes mounted path) over req.path when available.
    const raw =
        req.originalUrl?.split("?")[0] || req.url?.split("?")[0] || req.path;
    return raw.startsWith("/") ? raw : `/${raw}`;
}

export const AI_CAPABILITY_DEFS: Record<AiCapability, AiCapabilityDefinition> =
    {
        openai_chat: {
            id: "openai_chat",
            routes: [
                { method: "POST", path: "/v1/chat/completions" },
                { method: "POST", path: "/chat/completions" }
            ],
            extractModel: bodyModel,
            resolveUpstreamUrl: (base, req) =>
                joinUpstreamUrl(base, pathFromRequest(req))
        },
        openai_responses: {
            id: "openai_responses",
            routes: [{ method: "POST", path: "/v1/responses" }],
            extractModel: bodyModel,
            resolveUpstreamUrl: (base, req) =>
                joinUpstreamUrl(base, pathFromRequest(req))
        },
        anthropic_messages: {
            id: "anthropic_messages",
            routes: [{ method: "POST", path: "/v1/messages" }],
            extractModel: bodyModel,
            resolveUpstreamUrl: (base, req) =>
                joinUpstreamUrl(base, pathFromRequest(req))
        },
        gemini_generate_content: {
            id: "gemini_generate_content",
            routes: [
                {
                    method: "POST",
                    path: "/v1beta/models/:model\\:generateContent"
                },
                {
                    method: "POST",
                    path: "/v1beta/models/:model\\:streamGenerateContent"
                }
            ],
            extractModel: paramModel,
            resolveUpstreamUrl: (base, req) =>
                joinUpstreamUrl(base, pathFromRequest(req))
        },
        google_generate_content: {
            id: "google_generate_content",
            routes: [
                {
                    method: "POST",
                    // Vertex publisher model generateContent
                    path: "/v1/projects/:project/locations/:location/publishers/:publisher/models/:model\\:generateContent"
                },
                {
                    method: "POST",
                    path: "/v1/projects/:project/locations/:location/publishers/:publisher/models/:model\\:streamGenerateContent"
                }
            ],
            extractModel: paramModel,
            resolveUpstreamUrl: (base, req) =>
                joinUpstreamUrl(base, pathFromRequest(req))
        },
        google_raw_predict: {
            id: "google_raw_predict",
            routes: [
                {
                    method: "POST",
                    path: "/v1/projects/:project/locations/:location/publishers/:publisher/models/:model\\:rawPredict"
                },
                {
                    method: "POST",
                    path: "/v1/projects/:project/locations/:location/publishers/:publisher/models/:model\\:streamRawPredict"
                }
            ],
            extractModel: paramModel,
            resolveUpstreamUrl: (base, req) =>
                joinUpstreamUrl(base, pathFromRequest(req))
        },
        bedrock_model_invoke: {
            id: "bedrock_model_invoke",
            routes: [
                { method: "POST", path: "/model/:model/invoke" },
                {
                    method: "POST",
                    path: "/model/:model/invoke-with-response-stream"
                }
            ],
            extractModel: paramModel,
            resolveUpstreamUrl: (base, req) =>
                joinUpstreamUrl(base, pathFromRequest(req))
        },
        bedrock_converse: {
            id: "bedrock_converse",
            routes: [
                { method: "POST", path: "/model/:model/converse" },
                { method: "POST", path: "/model/:model/converse-stream" }
            ],
            extractModel: paramModel,
            resolveUpstreamUrl: (base, req) =>
                joinUpstreamUrl(base, pathFromRequest(req))
        }
    };

export const AI_PROVIDER_CAPABILITY_DEFAULTS: Record<
    Exclude<AiProviderType, "custom">,
    readonly AiCapability[]
> = {
    openai: ["openai_chat"],
    anthropic: ["anthropic_messages"],
    googleGemini: ["openai_chat"],
    vertexAi: ["google_generate_content"],
    bedrock: ["bedrock_converse"],
    microsoftFoundry: ["openai_chat"],
    openRouter: ["openai_chat"],
    vercelAiGateway: ["openai_chat"]
};

export function isAiCapability(value: unknown): value is AiCapability {
    return (
        typeof value === "string" &&
        (AI_CAPABILITIES as readonly string[]).includes(value)
    );
}

export function parseCapabilities(raw: unknown): AiCapability[] {
    if (raw == null) {
        return [];
    }

    let parsed: unknown = raw;
    if (typeof raw === "string") {
        const trimmed = raw.trim();
        if (!trimmed) {
            return [];
        }
        try {
            parsed = JSON.parse(trimmed);
        } catch {
            return [];
        }
    }

    if (!Array.isArray(parsed)) {
        return [];
    }

    const out: AiCapability[] = [];
    const seen = new Set<AiCapability>();
    for (const item of parsed) {
        if (isAiCapability(item) && !seen.has(item)) {
            seen.add(item);
            out.push(item);
        }
    }
    return out;
}

export function serializeCapabilities(capabilities: AiCapability[]): string {
    return JSON.stringify(capabilities);
}

export function providerHasCapability(
    capabilities: AiCapability[] | string | null | undefined,
    capability: AiCapability
): boolean {
    const list =
        typeof capabilities === "string" || capabilities == null
            ? parseCapabilities(capabilities)
            : capabilities;
    return list.includes(capability);
}

export function resolveCapabilitiesForCreate(input: {
    type: AiProviderType;
    capabilities?: AiCapability[] | null;
}): AiCapability[] {
    if (input.type === "custom") {
        return parseCapabilities(input.capabilities ?? []);
    }
    return [...AI_PROVIDER_CAPABILITY_DEFAULTS[input.type]];
}

export function defaultsForProviderType(
    type: AiProviderType
): readonly AiCapability[] {
    if (type === "custom") {
        return [];
    }
    return AI_PROVIDER_CAPABILITY_DEFAULTS[type];
}
