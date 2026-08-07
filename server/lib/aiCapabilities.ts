import type { Request } from "express";

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
    isStreaming: (req: Request, contentType: string) => boolean;
};

function bodyModel(req: Request): string | undefined {
    return typeof req.body?.model === "string" ? req.body.model : undefined;
}

function paramModel(req: Request): string | undefined {
    const model = req.params?.model;
    return typeof model === "string" && model.length > 0 ? model : undefined;
}

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
    const raw = req.originalUrl || req.url || req.path;
    return raw.startsWith("/") ? raw : `/${raw}`;
}

function bodyRequestsStream(req: Request): boolean {
    return req.body?.stream === true;
}

function contentTypeIsSse(contentType: string): boolean {
    return contentType.includes("text/event-stream");
}

function contentTypeIsAmazonEventStream(contentType: string): boolean {
    return contentType.includes("application/vnd.amazon.eventstream");
}

function pathIncludes(req: Request, fragment: string): boolean {
    return pathFromRequest(req).includes(fragment);
}

function isBodyOrSseStreaming(req: Request, contentType: string): boolean {
    return bodyRequestsStream(req) || contentTypeIsSse(contentType);
}

function isGeminiStyleStreaming(req: Request, contentType: string): boolean {
    return (
        pathIncludes(req, "streamGenerateContent") ||
        pathIncludes(req, "alt=sse") ||
        contentTypeIsSse(contentType)
    );
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
                joinUpstreamUrl(base, pathFromRequest(req)),
            isStreaming: isBodyOrSseStreaming
        },
        openai_responses: {
            id: "openai_responses",
            routes: [{ method: "POST", path: "/v1/responses" }],
            extractModel: bodyModel,
            resolveUpstreamUrl: (base, req) =>
                joinUpstreamUrl(base, pathFromRequest(req)),
            isStreaming: isBodyOrSseStreaming
        },
        anthropic_messages: {
            id: "anthropic_messages",
            routes: [{ method: "POST", path: "/v1/messages" }],
            extractModel: bodyModel,
            resolveUpstreamUrl: (base, req) =>
                joinUpstreamUrl(base, pathFromRequest(req)),
            isStreaming: isBodyOrSseStreaming
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
                joinUpstreamUrl(base, pathFromRequest(req)),
            isStreaming: isGeminiStyleStreaming
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
                joinUpstreamUrl(base, pathFromRequest(req)),
            isStreaming: isGeminiStyleStreaming
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
                joinUpstreamUrl(base, pathFromRequest(req)),
            isStreaming: (req, contentType) =>
                pathIncludes(req, "streamRawPredict") ||
                pathIncludes(req, "alt=sse") ||
                contentTypeIsSse(contentType)
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
                joinUpstreamUrl(base, pathFromRequest(req)),
            isStreaming: (req, contentType) =>
                pathIncludes(req, "invoke-with-response-stream") ||
                contentTypeIsAmazonEventStream(contentType) ||
                contentTypeIsSse(contentType)
        },
        bedrock_converse: {
            id: "bedrock_converse",
            routes: [
                { method: "POST", path: "/model/:model/converse" },
                { method: "POST", path: "/model/:model/converse-stream" }
            ],
            extractModel: paramModel,
            resolveUpstreamUrl: (base, req) =>
                joinUpstreamUrl(base, pathFromRequest(req)),
            isStreaming: (req, contentType) =>
                pathIncludes(req, "converse-stream") ||
                contentTypeIsAmazonEventStream(contentType) ||
                contentTypeIsSse(contentType)
        }
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
