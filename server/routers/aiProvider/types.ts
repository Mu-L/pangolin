import type { AiModel, AiProvider } from "@server/db";
import type { PaginatedResponse } from "@server/types/Pagination";
import {
    resolveAiProviderConfig,
    type AiProviderAuthType,
    type AiProviderRoutingMode,
    type AiProviderType
} from "@server/lib/aiProviderDefaults";
import { decrypt } from "@server/lib/crypto";
import config from "@server/lib/config";

export type AiProviderPublic = Omit<AiProvider, "apiKey"> & {
    /** Decrypted API key. Only included on get/create/update of a single provider. */
    apiKey?: string | null;
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

export function toPublicAiProvider(
    provider: AiProvider,
    options?: { includeApiKey?: boolean }
): AiProviderPublic {
    const { apiKey: encryptedApiKey, ...rest } = provider;
    const resolved = resolveAiProviderConfig({
        type: provider.type as AiProviderType,
        upstreamUrl: provider.upstreamUrl,
        authType: provider.authType as AiProviderAuthType | null,
        routingMode: provider.routingMode as AiProviderRoutingMode | null
    });

    let apiKey: string | null | undefined;
    if (options?.includeApiKey) {
        if (encryptedApiKey) {
            apiKey = decrypt(
                encryptedApiKey,
                config.getRawConfig().server.secret!
            );
        } else {
            apiKey = null;
        }
    }

    return {
        ...rest,
        ...(options?.includeApiKey ? { apiKey } : {}),
        effectiveUpstreamUrl: resolved.upstreamUrl,
        effectiveAuthType: resolved.authType
    };
}
