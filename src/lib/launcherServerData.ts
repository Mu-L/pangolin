import { internal } from "@app/lib/api";
import type { LauncherActiveViewId } from "@app/lib/launcherLocalStorage";
import { resolveLauncherStateFromUrl } from "@app/lib/launcherUrlState";
import { buildLauncherSearchParams } from "@app/lib/launcherSearchParams";
import type {
    LauncherGroup,
    LauncherResource,
    LauncherViewConfig,
    LauncherViewRecord,
    ListLauncherGroupsResponse,
    ListLauncherResourcesResponse,
    ListLauncherViewsResponse
} from "@server/routers/launcher/types";
import { AxiosResponse } from "axios";

export type LauncherGroupResources = {
    resources: LauncherResource[];
    pagination: {
        total: number;
        page: number;
        pageSize: number;
    };
};

export type LauncherPageData = {
    views: LauncherViewRecord[];
    activeViewId: LauncherActiveViewId;
    config: LauncherViewConfig;
    savedConfig: LauncherViewConfig;
    groups: LauncherGroup[];
    groupsPagination: {
        total: number;
        page: number;
        pageSize: number;
    };
    resourcesByGroupKey: Record<string, LauncherGroupResources>;
};

const emptyResources: LauncherGroupResources = {
    resources: [],
    pagination: { total: 0, page: 1, pageSize: 20 }
};

export async function fetchLauncherPageData(
    orgId: string,
    searchParams: URLSearchParams,
    cookieHeader: Awaited<
        ReturnType<typeof import("@app/lib/api/cookies").authCookieHeader>
    >
): Promise<LauncherPageData> {
    let views: LauncherViewRecord[] = [];
    try {
        const viewsRes = await internal.get<
            AxiosResponse<ListLauncherViewsResponse>
        >(`/org/${orgId}/launcher/views`, cookieHeader);
        views = viewsRes.data.data.views;
    } catch (e) {}

    const { activeViewId, config, savedConfig } = resolveLauncherStateFromUrl(
        searchParams,
        views,
        null
    );

    const groupFilters = {
        query: config.query,
        groupBy: config.groupBy,
        siteIds: config.siteIds,
        labelIds: config.labelIds,
        sort_by: config.sortBy,
        order: config.order,
        pageSize: 20
    };

    let groups: LauncherGroup[] = [];
    let groupsPagination: LauncherPageData["groupsPagination"] = {
        total: 0,
        page: 1,
        pageSize: 20
    };

    try {
        const sp = buildLauncherSearchParams(groupFilters, 1);
        const groupsRes = await internal.get<
            AxiosResponse<ListLauncherGroupsResponse>
        >(`/org/${orgId}/launcher/groups?${sp.toString()}`, cookieHeader);
        groups = groupsRes.data.data.groups;
        groupsPagination = groupsRes.data.data.pagination;
    } catch (e) {}

    const resourcesByGroupKey: Record<string, LauncherGroupResources> = {};

    await Promise.all(
        groups.map(async (group) => {
            try {
                const sp = buildLauncherSearchParams(
                    {
                        ...groupFilters,
                        groupKey: group.groupKey
                    },
                    1
                );
                const res = await internal.get<
                    AxiosResponse<ListLauncherResourcesResponse>
                >(
                    `/org/${orgId}/launcher/resources?${sp.toString()}`,
                    cookieHeader
                );
                resourcesByGroupKey[group.groupKey] = {
                    resources: res.data.data.resources,
                    pagination: res.data.data.pagination
                };
            } catch (e) {
                resourcesByGroupKey[group.groupKey] = emptyResources;
            }
        })
    );

    return {
        views,
        activeViewId,
        config,
        savedConfig,
        groups,
        groupsPagination,
        resourcesByGroupKey
    };
}
