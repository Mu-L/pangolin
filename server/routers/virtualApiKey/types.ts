import type { PublicVirtualApiKey } from "@server/lib/virtualApiKey";
import type { PaginatedResponse } from "@server/types/Pagination";

export type { PublicVirtualApiKey };

export type VirtualApiKeyWithResources = PublicVirtualApiKey & {
    resourceIds: number[];
};

export type ListVirtualApiKeysResponse = PaginatedResponse<{
    virtualApiKeys: VirtualApiKeyWithResources[];
}>;

export type GetVirtualApiKeyResponse = {
    virtualApiKey: VirtualApiKeyWithResources;
};

export type CreateOrEditVirtualApiKeyResponse = {
    virtualApiKey: VirtualApiKeyWithResources;
};

export type ListMyVirtualApiKeysResponse = {
    userKey: VirtualApiKeyWithResources;
    manualKeys: VirtualApiKeyWithResources[];
};

export type GetMyVirtualApiKeyResponse = {
    virtualApiKey: VirtualApiKeyWithResources;
};
