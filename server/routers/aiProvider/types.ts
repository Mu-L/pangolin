import type { AiModel, AiProvider } from "@server/db";
import type { PaginatedResponse } from "@server/types/Pagination";
import type { AiProviderAuthType } from "@server/lib/aiProviderDefaults";
import { decrypt } from "@server/lib/crypto";
import config from "@server/lib/config";

export type AiProviderPublic = Omit<AiProvider, "apiKey"> & {
    /** Decrypted API key. Only included on get/create/update of a single provider. */
    apiKey?: string | null;
    effectiveUpstreamUrl: string | null;
    effectiveAuthType: AiProviderAuthType;
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
        effectiveUpstreamUrl: provider.upstreamUrl,
        effectiveAuthType: provider.authType as AiProviderAuthType
    };
}
