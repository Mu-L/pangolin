import { build } from "@server/build";
import type { QueryRequestAnalyticsResponse } from "@server/routers/auditLogs";
import type { ListClientsResponse } from "@server/routers/client";
import type { ListDomainsResponse } from "@server/routers/domain";
import type {
    GetResourceWhitelistResponse,
    ListResourceNamesResponse
} from "@server/routers/resource";
import type { ListRolesResponse } from "@server/routers/role";
import type { ListSitesResponse } from "@server/routers/site";
import type {
    ListSiteResourceClientsResponse,
    ListSiteResourceRolesResponse,
    ListSiteResourceUsersResponse
} from "@server/routers/siteResource";
import type { ListTargetsResponse } from "@server/routers/target";
import type { ListUsersResponse } from "@server/routers/user";
import type ResponseT from "@server/types/Response";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import z from "zod";
import { remote } from "./api";
import { durationToMs } from "./durationToMs";

export type ProductUpdate = {
    link: string | null;
    build: "enterprise" | "oss" | "saas" | null;
    id: number;
    type: "Update" | "Important" | "New" | "Warning";
    title: string;
    contents: string;
    publishedAt: Date;
    showUntil: Date;
};

export type LatestVersionResponse = {
    pangolin: {
        latestVersion: string;
        releaseNotes: string;
    };
};

export const productUpdatesQueries = {
    list: (enabled: boolean, version?: string) =>
        queryOptions({
            queryKey: ["PRODUCT_UPDATES"] as const,
            queryFn: async ({ signal }) => {
                const sp = new URLSearchParams({
                    build,
                    ...(version ? { version } : {})
                });
                const data = await remote.get<ResponseT<ProductUpdate[]>>(
                    `/product-updates?${sp.toString()}`,
                    { signal }
                );
                return data.data;
            },
            refetchInterval: (query) => {
                if (query.state.data) {
                    return durationToMs(5, "minutes");
                }
                return false;
            },
            enabled
        }),
    latestVersion: (enabled: boolean) =>
        queryOptions({
            queryKey: ["LATEST_VERSION"] as const,
            queryFn: async ({ signal }) => {
                const data = await remote.get<ResponseT<LatestVersionResponse>>(
                    "/versions",
                    { signal }
                );
                return data.data;
            },
            placeholderData: keepPreviousData,
            refetchInterval: (query) => {
                if (query.state.data) {
                    return durationToMs(30, "minutes");
                }
                return false;
            },
            enabled: enabled && build !== "saas" // disabled in cloud version
            // because we don't need to listen for new versions there
        })
};

export const clientFilterSchema = z.object({
    filter: z.enum(["machine", "user"]),
    limit: z.int().prefault(1000).optional()
});

export const orgQueries = {
    clients: ({
        orgId,
        filters
    }: {
        orgId: string;
        filters: z.infer<typeof clientFilterSchema>;
    }) =>
        queryOptions({
            queryKey: ["ORG", orgId, "CLIENTS", filters] as const,
            queryFn: async ({ signal, meta }) => {
                const sp = new URLSearchParams({
                    ...filters,
                    limit: (filters.limit ?? 1000).toString()
                });

                const res = await meta!.api.get<
                    AxiosResponse<ListClientsResponse>
                >(`/org/${orgId}/clients?${sp.toString()}`, { signal });

                return res.data.data.clients;
            }
        }),
    users: ({ orgId }: { orgId: string }) =>
        queryOptions({
            queryKey: ["ORG", orgId, "USERS"] as const,
            queryFn: async ({ signal, meta }) => {
                const res = await meta!.api.get<
                    AxiosResponse<ListUsersResponse>
                >(`/org/${orgId}/users`, { signal });

                return res.data.data.users;
            }
        }),
    roles: ({ orgId }: { orgId: string }) =>
        queryOptions({
            queryKey: ["ORG", orgId, "ROLES"] as const,
            queryFn: async ({ signal, meta }) => {
                const res = await meta!.api.get<
                    AxiosResponse<ListRolesResponse>
                >(`/org/${orgId}/roles`, { signal });

                return res.data.data.roles;
            }
        }),

    sites: ({ orgId }: { orgId: string }) =>
        queryOptions({
            queryKey: ["ORG", orgId, "SITES"] as const,
            queryFn: async ({ signal, meta }) => {
                const res = await meta!.api.get<
                    AxiosResponse<ListSitesResponse>
                >(`/org/${orgId}/sites`, { signal });
                return res.data.data.sites;
            }
        }),

    domains: ({ orgId }: { orgId: string }) =>
        queryOptions({
            queryKey: ["ORG", orgId, "DOMAINS"] as const,
            queryFn: async ({ signal, meta }) => {
                const res = await meta!.api.get<
                    AxiosResponse<ListDomainsResponse>
                >(`/org/${orgId}/domains`, { signal });
                return res.data.data.domains;
            }
        }),
    identityProviders: ({
        orgId,
        useOrgOnlyIdp
    }: {
        orgId: string;
        useOrgOnlyIdp?: boolean;
    }) =>
        queryOptions({
            queryKey: ["ORG", orgId, "IDPS"] as const,
            queryFn: async ({ signal, meta }) => {
                const res = await meta!.api.get<
                    AxiosResponse<{
                        idps: { idpId: number; name: string }[];
                    }>
                >(
                    build === "saas" || useOrgOnlyIdp
                        ? `/org/${orgId}/idp`
                        : "/idp",
                    { signal }
                );
                return res.data.data.idps;
            }
        })
};

export const logAnalyticsFiltersSchema = z.object({
    timeStart: z
        .string()
        .refine((val) => !isNaN(Date.parse(val)), {
            error: "timeStart must be a valid ISO date string"
        })
        .optional(),
    timeEnd: z
        .string()
        .refine((val) => !isNaN(Date.parse(val)), {
            error: "timeEnd must be a valid ISO date string"
        })
        .optional(),
    resourceId: z
        .string()
        .optional()
        .transform(Number)
        .pipe(z.int().positive())
        .optional()
});

export type LogAnalyticsFilters = z.TypeOf<typeof logAnalyticsFiltersSchema>;

export const logQueries = {
    requestAnalytics: ({
        orgId,
        filters
    }: {
        orgId: string;
        filters: LogAnalyticsFilters;
    }) =>
        queryOptions({
            queryKey: ["REQUEST_LOG_ANALYTICS", orgId, filters] as const,
            queryFn: async ({ signal, meta }) => {
                const res = await meta!.api.get<
                    AxiosResponse<QueryRequestAnalyticsResponse>
                >(`/org/${orgId}/logs/analytics`, {
                    params: filters,
                    signal
                });
                return res.data.data;
            },
            refetchInterval: (query) => {
                if (query.state.data) {
                    return durationToMs(30, "seconds");
                }
                return false;
            }
        })
};

export const resourceQueries = {
    resourceUsers: ({ resourceId }: { resourceId: number }) =>
        queryOptions({
            queryKey: ["RESOURCES", resourceId, "USERS"] as const,
            queryFn: async ({ signal, meta }) => {
                const res = await meta!.api.get<
                    AxiosResponse<ListSiteResourceUsersResponse>
                >(`/resource/${resourceId}/users`, { signal });
                return res.data.data.users;
            }
        }),
    resourceRoles: ({ resourceId }: { resourceId: number }) =>
        queryOptions({
            queryKey: ["RESOURCES", resourceId, "ROLES"] as const,
            queryFn: async ({ signal, meta }) => {
                const res = await meta!.api.get<
                    AxiosResponse<ListSiteResourceRolesResponse>
                >(`/resource/${resourceId}/roles`, { signal });

                return res.data.data.roles;
            }
        }),
    siteResourceUsers: ({ siteResourceId }: { siteResourceId: number }) =>
        queryOptions({
            queryKey: ["SITE_RESOURCES", siteResourceId, "USERS"] as const,
            queryFn: async ({ signal, meta }) => {
                const res = await meta!.api.get<
                    AxiosResponse<ListSiteResourceUsersResponse>
                >(`/site-resource/${siteResourceId}/users`, { signal });
                return res.data.data.users;
            }
        }),
    siteResourceRoles: ({ siteResourceId }: { siteResourceId: number }) =>
        queryOptions({
            queryKey: ["SITE_RESOURCES", siteResourceId, "ROLES"] as const,
            queryFn: async ({ signal, meta }) => {
                const res = await meta!.api.get<
                    AxiosResponse<ListSiteResourceRolesResponse>
                >(`/site-resource/${siteResourceId}/roles`, { signal });

                return res.data.data.roles;
            }
        }),
    siteResourceClients: ({ siteResourceId }: { siteResourceId: number }) =>
        queryOptions({
            queryKey: ["SITE_RESOURCES", siteResourceId, "CLIENTS"] as const,
            queryFn: async ({ signal, meta }) => {
                const res = await meta!.api.get<
                    AxiosResponse<ListSiteResourceClientsResponse>
                >(`/site-resource/${siteResourceId}/clients`, { signal });

                return res.data.data.clients;
            }
        }),
    resourceTargets: ({ resourceId }: { resourceId: number }) =>
        queryOptions({
            queryKey: ["RESOURCES", resourceId, "TARGETS"] as const,
            queryFn: async ({ signal, meta }) => {
                const res = await meta!.api.get<
                    AxiosResponse<ListTargetsResponse>
                >(`/resource/${resourceId}/targets`, { signal });

                return res.data.data.targets;
            }
        }),
    resourceWhitelist: ({ resourceId }: { resourceId: number }) =>
        queryOptions({
            queryKey: ["RESOURCES", resourceId, "WHITELISTS"] as const,
            queryFn: async ({ signal, meta }) => {
                const res = await meta!.api.get<
                    AxiosResponse<GetResourceWhitelistResponse>
                >(`/resource/${resourceId}/whitelist`, { signal });

                return res.data.data.whitelist;
            }
        }),
    listNamesPerOrg: (orgId: string) =>
        queryOptions({
            queryKey: ["RESOURCES_NAMES", orgId] as const,
            queryFn: async ({ signal, meta }) => {
                const res = await meta!.api.get<
                    AxiosResponse<ListResourceNamesResponse>
                >(`/org/${orgId}/resource-names`, {
                    signal
                });
                return res.data.data;
            }
        })
};

export const approvalFiltersSchema = z.object({
    approvalState: z
        .enum(["pending", "approved", "denied", "all"])
        .default("pending")
        .catch("pending")
});

export type ApprovalItem = {
    approvalId: number;
    orgId: string;
    clientId: number | null;
    niceId: string | null;
    decision: "pending" | "approved" | "denied";
    type: "user_device";
    user: {
        name: string | null;
        userId: string;
        username: string;
        email: string | null;
    };
    deviceName: string | null;
    fingerprint: {
        platform: string | null;
        osVersion: string | null;
        kernelVersion: string | null;
        arch: string | null;
        deviceModel: string | null;
        serialNumber: string | null;
        username: string | null;
        hostname: string | null;
    } | null;
};

export const approvalQueries = {
    listApprovals: (
        orgId: string,
        filters: z.infer<typeof approvalFiltersSchema>
    ) =>
        queryOptions({
            queryKey: ["APPROVALS", orgId, filters] as const,
            queryFn: async ({ signal, meta }) => {
                const sp = new URLSearchParams();

                if (filters.approvalState) {
                    sp.set("approvalState", filters.approvalState);
                }

                const res = await meta!.api.get<
                    AxiosResponse<{ approvals: ApprovalItem[] }>
                >(`/org/${orgId}/approvals?${sp.toString()}`, {
                    signal
                });
                return res.data.data;
            }
        }),
    pendingCount: (orgId: string) =>
        queryOptions({
            queryKey: ["APPROVALS", orgId, "COUNT", "pending"] as const,
            queryFn: async ({ signal, meta }) => {
                const res = await meta!.api.get<
                    AxiosResponse<{ count: number }>
                >(`/org/${orgId}/approvals/count?approvalState=pending`, {
                    signal
                });
                return res.data.data.count;
            }
        })
};
