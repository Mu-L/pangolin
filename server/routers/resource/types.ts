import type { ResourcePolicy } from "@server/db";
import type { PaginatedResponse } from "@server/types/Pagination";

export type GetMaintenanceInfoResponse = {
    resourceId: number;
    name: string;
    fullDomain: string | null;
    maintenanceModeEnabled: boolean;
    maintenanceModeType: "forced" | "automatic" | null;
    maintenanceTitle: string | null;
    maintenanceMessage: string | null;
    maintenanceEstimatedTime: string | null;
};

export type ListResourcePoliciesResponse = PaginatedResponse<{
    policies: Array<
        Pick<ResourcePolicy, "resourcePolicyId" | "niceId" | "name" | "orgId">
    >;
}>;
