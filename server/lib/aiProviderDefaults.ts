export type AiProviderType = "openai" | "anthropic" | "bedrock" | "custom";
export type AiProviderAuthType = "bearer";
export type AiBudgetUnit = "usd" | "tokens";

type AiProviderDefaults = {
    upstreamUrl: string;
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
    bedrock: {
        upstreamUrl: "https://bedrock-runtime.us-east-1.amazonaws.com",
        authType: "bearer"
    }
};

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
