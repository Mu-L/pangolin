import type { AiModel, AiProvider } from "@server/db";
import type { PaginatedResponse } from "@server/types/Pagination";
import {
    resolveAiProviderConfig,
    type AiProviderAuthType,
    type AiProviderRoutingMode,
    type AiProviderType
} from "@server/lib/aiProviderDefaults";

export type AiProviderPublic = Omit<AiProvider, "apiKey"> & {
    effectiveUpstreamUrl: string | null;
    effectiveAuthType: AiProviderAuthType | null;
};

export type ListAiProvidersResponse = PaginatedResponse<{
    providers: AiProviderPublic[];
}>;

export type GetAiProviderResponse = {
    provider: AiProviderPublic;
};

export type CreateOrEditAiProviderResponse = {
    provider: AiProviderPublic;
};

export type ListAiModelsResponse = PaginatedResponse<{
    models: AiModel[];
}>;

export type GetAiModelResponse = {
    model: AiModel;
};

export type CreateOrEditAiModelResponse = {
    model: AiModel;
};

export function toPublicAiProvider(provider: AiProvider): AiProviderPublic {
    const { apiKey: _apiKey, ...rest } = provider;
    const resolved = resolveAiProviderConfig({
        type: provider.type as AiProviderType,
        upstreamUrl: provider.upstreamUrl,
        authType: provider.authType as AiProviderAuthType | null,
        routingMode: provider.routingMode as AiProviderRoutingMode | null
    });

    return {
        ...rest,
        effectiveUpstreamUrl: resolved.upstreamUrl,
        effectiveAuthType: resolved.authType
    };
}
