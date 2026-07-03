import { regionalCache as cache } from "#dynamic/lib/cache";
import {
    listLauncherGroupsForUser,
    resolveAccessibleIds
} from "./launcherResourceAccess";
import {
    parseIdListParam,
    type LauncherScaleInfo,
    type LauncherScaleQuery
} from "./types";

export const LAUNCHER_FULL_MAX_RESOURCES = 2000;
export const LAUNCHER_FULL_MAX_SITE_GROUPS = 200;
export const LAUNCHER_FULL_MAX_LABEL_GROUPS = 100;
export const LAUNCHER_FILTERED_SITE_GROUPING_MAX = 20;

const LAUNCHER_SCALE_TTL_SEC = 60;

function launcherScaleCacheKey(
    orgId: string,
    userId: string,
    roleIds: number[],
    query: LauncherScaleQuery
) {
    const rolesKey = [...roleIds].sort((a, b) => a - b).join(",");
    const filterKey = [
        query.query,
        query.groupBy,
        query.siteIds ?? "",
        query.labelIds ?? "",
        query.sort_by,
        query.order
    ].join("|");
    return `launcherScale:${orgId}:${userId}:${rolesKey}:${filterKey}`;
}

async function getLauncherScaleForUserUncached(
    orgId: string,
    userId: string,
    userRoleIds: number[],
    query: LauncherScaleQuery
): Promise<LauncherScaleInfo> {
    const accessible = await resolveAccessibleIds(orgId, userId, userRoleIds);
    const resourceCount =
        accessible.resourceIds.length + accessible.siteResourceIds.length;

    const baselineQuery = {
        query: "",
        groupBy: "site" as const,
        siteIds: undefined,
        labelIds: undefined,
        sort_by: "name" as const,
        order: "asc" as const,
        page: 1,
        pageSize: 1
    };

    const [{ total: siteGroupCount }, { total: labelGroupCount }] =
        await Promise.all([
            listLauncherGroupsForUser(
                orgId,
                userId,
                userRoleIds,
                baselineQuery
            ),
            listLauncherGroupsForUser(orgId, userId, userRoleIds, {
                ...baselineQuery,
                groupBy: "label"
            })
        ]);

    const mode =
        resourceCount <= LAUNCHER_FULL_MAX_RESOURCES &&
        siteGroupCount <= LAUNCHER_FULL_MAX_SITE_GROUPS
            ? "full"
            : "compact";

    const siteFilterIds = parseIdListParam(query.siteIds);

    const allowSiteGrouping =
        siteGroupCount <= LAUNCHER_FULL_MAX_SITE_GROUPS ||
        (siteFilterIds.length > 0 &&
            siteFilterIds.length <= LAUNCHER_FILTERED_SITE_GROUPING_MAX);

    const allowLabelGrouping =
        labelGroupCount <= LAUNCHER_FULL_MAX_LABEL_GROUPS;

    const requireSearchOrFilter =
        mode === "compact" && resourceCount > LAUNCHER_FULL_MAX_RESOURCES;

    return {
        mode,
        resourceCount,
        siteGroupCount,
        labelGroupCount,
        capabilities: {
            allowSiteGrouping,
            allowLabelGrouping,
            requireSearchOrFilter
        }
    };
}

export async function getLauncherScaleForUser(
    orgId: string,
    userId: string,
    userRoleIds: number[],
    query: LauncherScaleQuery
): Promise<LauncherScaleInfo> {
    const cacheKey = launcherScaleCacheKey(orgId, userId, userRoleIds, query);
    const cached = await cache.get<LauncherScaleInfo>(cacheKey);
    if (cached) {
        return cached;
    }

    const result = await getLauncherScaleForUserUncached(
        orgId,
        userId,
        userRoleIds,
        query
    );
    await cache.set(cacheKey, result, LAUNCHER_SCALE_TTL_SEC);
    return result;
}
