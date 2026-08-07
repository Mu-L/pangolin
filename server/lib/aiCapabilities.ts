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
 * Join a provider base URL with an inbound request path.
 */
export function joinUpstreamUrl(baseUrl: string, path: string): string {
    const base = baseUrl.replace(/\/+$/, "");
    let suffix = path.startsWith("/") ? path : `/${path}`;

    let basePathname = "/";
    try {
        basePathname = new URL(base).pathname.replace(/\/+$/, "") || "/";
    } catch {
        // Fall through with "/" non-absolute bases are not expected in
        // production, but keep joining usable for malformed input.
    }

    if (basePathname !== "/") {
        const baseSegs = basePathname.split("/").filter(Boolean);
        const pathSegs = suffix.split("/").filter(Boolean);
        const max = Math.min(baseSegs.length, pathSegs.length);
        let overlap = 0;
        for (let n = max; n >= 1; n--) {
            const baseSuffix = baseSegs.slice(-n);
            const pathPrefix = pathSegs.slice(0, n);
            if (baseSuffix.every((seg, i) => seg === pathPrefix[i])) {
                overlap = n;
                break;
            }
        }
        if (overlap > 0) {
            const remaining = pathSegs.slice(overlap);
            suffix = remaining.length > 0 ? `/${remaining.join("/")}` : "/";
        }
    }

    if (suffix === "/") {
        return base;
    }

    return `${base}${suffix}`;
}

function pathFromRequest(req: Request): string {
    // Prefer originalUrl (includes mounted path) over req.url when available.
    // Query string is preserved - some providers use it to select the
    // streaming response format (e.g. Gemini's `?alt=sse`).
    const raw = req.originalUrl || req.url || req.path;
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
    googleGemini: ["gemini_generate_content"],
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
    if (input.capabilities != null) {
        return parseCapabilities(input.capabilities);
    }
    if (input.type === "custom") {
        return [];
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
