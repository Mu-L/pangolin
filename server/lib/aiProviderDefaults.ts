export type AiProviderType =
    | "openai"
    | "anthropic"
    | "googleGemini"
    | "vertexAi"
    | "bedrock"
    | "microsoftFoundry"
    | "openRouter"
    | "vercelAiGateway"
    | "custom";

export const AI_PROVIDER_AUTH_TYPES = [
    "bearer",
    "x-api-key",
    "x-goog-api-key",
    "hec",
    "cf-aig-authorization",
    "none",
    "passthrough"
] as const;

export type AiProviderAuthType = (typeof AI_PROVIDER_AUTH_TYPES)[number];
export type AiBudgetUnit = "usd" | "tokens";
export type AiProviderRoutingMode = "url" | "target";

type AiProviderDefaults = {
    upstreamUrl: string | null;
    authType: AiProviderAuthType;
};

export const AI_PROVIDER_DEFAULTS: Record<
    Exclude<AiProviderType, "custom">,
    AiProviderDefaults
> = {
    openai: {
        upstreamUrl: "https://api.openai.com/v1",
        authType: "bearer"
    },
    anthropic: {
        upstreamUrl: "https://api.anthropic.com",
        authType: "x-api-key"
    },
    googleGemini: {
        upstreamUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
        authType: "x-goog-api-key"
    },
    vertexAi: {
        upstreamUrl: null,
        authType: "bearer"
    },
    bedrock: {
        upstreamUrl: "https://bedrock-runtime.us-east-1.amazonaws.com",
        authType: "bearer"
    },
    microsoftFoundry: {
        upstreamUrl: null,
        authType: "bearer"
    },
    openRouter: {
        upstreamUrl: "https://openrouter.ai/api/v1",
        authType: "bearer"
    },
    vercelAiGateway: {
        upstreamUrl: "https://ai-gateway.vercel.sh/v1",
        authType: "bearer"
    }
};

const CONFLICTING_AUTH_HEADERS = [
    "authorization",
    "x-api-key",
    "x-goog-api-key",
    "cf-aig-authorization"
] as const;

export function authTypeRequiresApiKey(authType: AiProviderAuthType): boolean {
    return authType !== "none" && authType !== "passthrough";
}

export function providerRequiresUpstreamUrl(
    type: AiProviderType,
    routingMode: AiProviderRoutingMode = "url"
): boolean {
    if (routingMode === "target") {
        return false;
    }
    if (type === "custom") {
        return true;
    }
    return AI_PROVIDER_DEFAULTS[type].upstreamUrl === null;
}

export function resolveAiProviderCreateFields(input: {
    type: AiProviderType;
    upstreamUrl?: string | null;
    authType?: AiProviderAuthType | null;
    routingMode?: AiProviderRoutingMode | null;
}): {
    upstreamUrl: string | null;
    authType: AiProviderAuthType;
    routingMode: AiProviderRoutingMode;
} {
    const routingMode =
        input.type === "custom" ? (input.routingMode ?? "url") : "url";

    if (routingMode === "target") {
        return {
            upstreamUrl: null,
            authType: input.authType ?? "bearer",
            routingMode
        };
    }

    if (input.type === "custom") {
        return {
            upstreamUrl: input.upstreamUrl ?? null,
            authType: input.authType ?? "bearer",
            routingMode
        };
    }

    const defaults = AI_PROVIDER_DEFAULTS[input.type];
    return {
        upstreamUrl: input.upstreamUrl ?? defaults.upstreamUrl,
        authType: input.authType ?? defaults.authType,
        routingMode
    };
}

/**
 * Apply provider auth to upstream headers.
 * - Injected modes: strip client auth headers, then set the provider key.
 * - none: strip client auth headers, send no auth.
 * - passthrough: leave client auth headers as-is.
 */
export function applyAiProviderAuthHeaders(
    headers: Record<string, string>,
    authType: AiProviderAuthType,
    apiKey: string | null
): void {
    if (authType === "passthrough") {
        return;
    }

    for (const name of CONFLICTING_AUTH_HEADERS) {
        for (const key of Object.keys(headers)) {
            if (key.toLowerCase() === name) {
                delete headers[key];
            }
        }
    }

    if (authType === "none") {
        return;
    }

    if (!apiKey) {
        throw new Error(`API key required for authType ${authType}`);
    }

    switch (authType) {
        case "bearer":
            headers["Authorization"] = `Bearer ${apiKey}`;
            break;
        case "x-api-key":
            headers["x-api-key"] = apiKey;
            break;
        case "x-goog-api-key":
            headers["x-goog-api-key"] = apiKey;
            break;
        case "hec":
            headers["Authorization"] = `Splunk ${apiKey}`;
            break;
        case "cf-aig-authorization":
            headers["cf-aig-authorization"] = `Bearer ${apiKey}`;
            break;
    }
}
