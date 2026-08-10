import type { PublicVirtualApiKey } from "@server/lib/virtualApiKey";
import type { PaginatedResponse } from "@server/types/Pagination";

export type { PublicVirtualApiKey };

export type ListVirtualApiKeysResponse = PaginatedResponse<{
    virtualApiKeys: (PublicVirtualApiKey & { resourceIds: number[] })[];
}>;

export type GetVirtualApiKeyResponse = {
    virtualApiKey: PublicVirtualApiKey & { resourceIds: number[] };
};

export type CreateOrEditVirtualApiKeyResponse = {
    virtualApiKey: PublicVirtualApiKey & { resourceIds: number[] };
};
