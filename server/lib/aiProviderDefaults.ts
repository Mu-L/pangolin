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

export type AiProviderAuthType = "bearer";
export type AiBudgetUnit = "usd" | "tokens";

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
        authType: "bearer"
    },
    googleGemini: {
        upstreamUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
        authType: "bearer"
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

export function providerRequiresUpstreamUrl(type: AiProviderType): boolean {
    if (type === "custom") {
        return true;
    }
    return AI_PROVIDER_DEFAULTS[type].upstreamUrl === null;
}

export function resolveAiProviderConfig(input: {
    type: AiProviderType;
    upstreamUrl: string | null;
    authType: AiProviderAuthType | null;
}): {
    upstreamUrl: string | null;
    authType: AiProviderAuthType | null;
} {
    if (input.type === "custom") {
        return {
            upstreamUrl: input.upstreamUrl,
            authType: input.authType
        };
    }

    const defaults = AI_PROVIDER_DEFAULTS[input.type];
    return {
        upstreamUrl: input.upstreamUrl ?? defaults.upstreamUrl,
        authType: input.authType ?? defaults.authType
    };
}
