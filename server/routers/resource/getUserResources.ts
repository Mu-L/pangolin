import { Request, Response, NextFunction } from "express";
import { db, DB_TYPE } from "@server/db";
import { and, eq, or, inArray, sql } from "drizzle-orm";
import {
    resources,
    userResources,
    roleResources,
    userOrgRoles,
    userOrgs,
    resourcePassword,
    resourcePincode,
    resourceWhitelist,
    siteResources,
    userSiteResources,
    roleSiteResources,
    siteNetworks,
    sites
} from "@server/db";
import createHttpError from "http-errors";
import HttpCode from "@server/types/HttpCode";
import { response } from "@server/lib/response";

export async function getUserResources(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const { orgId } = req.params;
        const userId = req.user?.userId;

        if (!userId) {
            return next(
                createHttpError(HttpCode.UNAUTHORIZED, "User not authenticated")
            );
        }

        // Check user is in organization and get their role IDs
        const [userOrg] = await db
            .select()
            .from(userOrgs)
            .where(and(eq(userOrgs.userId, userId), eq(userOrgs.orgId, orgId)))
            .limit(1);

        if (!userOrg) {
            return next(
                createHttpError(HttpCode.FORBIDDEN, "User not in organization")
            );
        }

        const userRoleIds = await db
            .select({ roleId: userOrgRoles.roleId })
            .from(userOrgRoles)
            .where(
                and(
                    eq(userOrgRoles.userId, userId),
                    eq(userOrgRoles.orgId, orgId)
                )
            )
            .then((rows) => rows.map((r) => r.roleId));

        // Get resources accessible through direct assignment or role assignment
        const directResourcesQuery = db
            .select({ resourceId: userResources.resourceId })
            .from(userResources)
            .where(eq(userResources.userId, userId));

        const roleResourcesQuery =
            userRoleIds.length > 0
                ? db
                      .select({ resourceId: roleResources.resourceId })
                      .from(roleResources)
                      .where(inArray(roleResources.roleId, userRoleIds))
                : Promise.resolve([]);

        const directSiteResourcesQuery = db
            .select({ siteResourceId: userSiteResources.siteResourceId })
            .from(userSiteResources)
            .where(eq(userSiteResources.userId, userId));

        const roleSiteResourcesQuery =
            userRoleIds.length > 0
                ? db
                      .select({
                          siteResourceId: roleSiteResources.siteResourceId
                      })
                      .from(roleSiteResources)
                      .where(inArray(roleSiteResources.roleId, userRoleIds))
                : Promise.resolve([]);

        const [
            directResources,
            roleResourceResults,
            directSiteResourceResults,
            roleSiteResourceResults
        ] = await Promise.all([
            directResourcesQuery,
            roleResourcesQuery,
            directSiteResourcesQuery,
            roleSiteResourcesQuery
        ]);

        // Combine all accessible resource IDs
        const accessibleResourceIds = [
            ...directResources.map((r) => r.resourceId),
            ...roleResourceResults.map((r) => r.resourceId)
        ];

        // Combine all accessible site resource IDs
        const accessibleSiteResourceIds = [
            ...directSiteResourceResults.map((r) => r.siteResourceId),
            ...roleSiteResourceResults.map((r) => r.siteResourceId)
        ];

        // Get resource details for accessible resources
        let resourcesData: Array<{
            resourceId: number;
            name: string;
            fullDomain: string | null;
            ssl: boolean;
            enabled: boolean;
            sso: boolean;
            protocol: string;
            emailWhitelistEnabled: boolean;
        }> = [];
        if (accessibleResourceIds.length > 0) {
            resourcesData = await db
                .select({
                    resourceId: resources.resourceId,
                    name: resources.name,
                    fullDomain: resources.fullDomain,
                    ssl: resources.ssl,
                    enabled: resources.enabled,
                    sso: resources.sso,
                    protocol: resources.protocol,
                    emailWhitelistEnabled: resources.emailWhitelistEnabled
                })
                .from(resources)
                .where(
                    and(
                        inArray(resources.resourceId, accessibleResourceIds),
                        eq(resources.orgId, orgId),
                        eq(resources.enabled, true)
                    )
                );
        }

        // Get site resource details for accessible site resources
        let siteResourcesData: Array<{
            siteResourceId: number;
            name: string;
            niceId: string;
            destination: string;
            mode: string;
            scheme: string | null;
            ssl: boolean;
            fullDomain: string | null;
            enabled: boolean;
            alias: string | null;
            aliasAddress: string | null;
            tcpPortRangeString: string | null;
            udpPortRangeString: string | null;
            disableIcmp: boolean | null;
            siteIds: number[];
            siteNames: string[];
            siteNiceIds: string[];
            siteAddresses: (string | null)[];
            siteOnlines: boolean[];
        }> = [];
        if (accessibleSiteResourceIds.length > 0) {
            const aggCol = <T>(column: any) => {
                if (DB_TYPE === "sqlite") {
                    return sql<T>`json_group_array(${column})`;
                }
                return sql<T>`COALESCE(array_agg(${column}) FILTER (WHERE ${sites.siteId} IS NOT NULL), '{}')`;
            };

            const siteResourcesRaw = await db
                .select({
                    siteResourceId: siteResources.siteResourceId,
                    name: siteResources.name,
                    niceId: siteResources.niceId,
                    destination: siteResources.destination,
                    mode: siteResources.mode,
                    scheme: siteResources.scheme,
                    ssl: siteResources.ssl,
                    fullDomain: siteResources.fullDomain,
                    enabled: siteResources.enabled,
                    alias: siteResources.alias,
                    aliasAddress: siteResources.aliasAddress,
                    tcpPortRangeString: siteResources.tcpPortRangeString,
                    udpPortRangeString: siteResources.udpPortRangeString,
                    disableIcmp: siteResources.disableIcmp,
                    siteIds: aggCol<number[]>(sites.siteId),
                    siteNames: aggCol<string[]>(sites.name),
                    siteNiceIds: aggCol<string[]>(sites.niceId),
                    siteAddresses: aggCol<(string | null)[]>(sites.address),
                    siteOnlines: aggCol<boolean[]>(sites.online)
                })
                .from(siteResources)
                .leftJoin(
                    siteNetworks,
                    eq(siteResources.networkId, siteNetworks.networkId)
                )
                .leftJoin(sites, eq(siteNetworks.siteId, sites.siteId))
                .where(
                    and(
                        inArray(
                            siteResources.siteResourceId,
                            accessibleSiteResourceIds
                        ),
                        eq(siteResources.orgId, orgId),
                        eq(siteResources.enabled, true)
                    )
                )
                .groupBy(siteResources.siteResourceId);

            siteResourcesData = siteResourcesRaw.map((row: any) => {
                if (DB_TYPE !== "sqlite") {
                    return row;
                }
                const siteIdsRaw = JSON.parse(row.siteIds) as (number | null)[];
                const siteNamesRaw = JSON.parse(row.siteNames) as (
                    | string
                    | null
                )[];
                const siteNiceIdsRaw = JSON.parse(row.siteNiceIds) as (
                    | string
                    | null
                )[];
                const siteAddressesRaw = JSON.parse(row.siteAddresses) as (
                    | string
                    | null
                )[];
                const siteOnlinesRaw = JSON.parse(row.siteOnlines) as (
                    | 0
                    | 1
                    | null
                )[];

                const siteIds: number[] = [];
                const siteNames: string[] = [];
                const siteNiceIds: string[] = [];
                const siteAddresses: (string | null)[] = [];
                const siteOnlines: boolean[] = [];
                for (let i = 0; i < siteIdsRaw.length; i++) {
                    if (siteIdsRaw[i] == null) continue;
                    siteIds.push(siteIdsRaw[i] as number);
                    siteNames.push((siteNamesRaw[i] ?? "") as string);
                    siteNiceIds.push((siteNiceIdsRaw[i] ?? "") as string);
                    siteAddresses.push(siteAddressesRaw[i] ?? null);
                    siteOnlines.push(siteOnlinesRaw[i] === 1);
                }

                return {
                    ...row,
                    siteIds,
                    siteNames,
                    siteNiceIds,
                    siteAddresses,
                    siteOnlines
                };
            });
        }

        // Check for password, pincode, and whitelist protection for each resource
        const resourcesWithAuth = await Promise.all(
            resourcesData.map(async (resource) => {
                const [passwordCheck, pincodeCheck, whitelistCheck] =
                    await Promise.all([
                        db
                            .select()
                            .from(resourcePassword)
                            .where(
                                eq(
                                    resourcePassword.resourceId,
                                    resource.resourceId
                                )
                            )
                            .limit(1),
                        db
                            .select()
                            .from(resourcePincode)
                            .where(
                                eq(
                                    resourcePincode.resourceId,
                                    resource.resourceId
                                )
                            )
                            .limit(1),
                        db
                            .select()
                            .from(resourceWhitelist)
                            .where(
                                eq(
                                    resourceWhitelist.resourceId,
                                    resource.resourceId
                                )
                            )
                            .limit(1)
                    ]);

                const hasPassword = passwordCheck.length > 0;
                const hasPincode = pincodeCheck.length > 0;
                const hasWhitelist =
                    whitelistCheck.length > 0 || resource.emailWhitelistEnabled;

                return {
                    resourceId: resource.resourceId,
                    name: resource.name,
                    domain: `${resource.ssl ? "https://" : "http://"}${resource.fullDomain}`,
                    enabled: resource.enabled,
                    protected: !!(
                        resource.sso ||
                        hasPassword ||
                        hasPincode ||
                        hasWhitelist
                    ),
                    protocol: resource.protocol,
                    sso: resource.sso,
                    password: hasPassword,
                    pincode: hasPincode,
                    whitelist: hasWhitelist
                };
            })
        );

        // Format site resources
        const siteResourcesFormatted = siteResourcesData.map((siteResource) => {
            return {
                siteResourceId: siteResource.siteResourceId,
                name: siteResource.name,
                destination: siteResource.destination,
                mode: siteResource.mode,
                protocol: siteResource.scheme,
                ssl: siteResource.ssl,
                fullDomain: siteResource.fullDomain,
                enabled: siteResource.enabled,
                alias: siteResource.alias,
                aliasAddress: siteResource.aliasAddress,
                tcpPortRangeString: siteResource.tcpPortRangeString,
                udpPortRangeString: siteResource.udpPortRangeString,
                disableIcmp: siteResource.disableIcmp,
                siteIds: siteResource.siteIds,
                siteNames: siteResource.siteNames,
                siteNiceIds: siteResource.siteNiceIds,
                siteAddresses: siteResource.siteAddresses,
                siteOnlines: siteResource.siteOnlines,
                type: "site" as const
            };
        });

        return response(res, {
            data: {
                resources: resourcesWithAuth,
                siteResources: siteResourcesFormatted
            },
            success: true,
            error: false,
            message: "User resources retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        console.error("Error fetching user resources:", error);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Internal server error"
            )
        );
    }
}

export type GetUserResourcesResponse = {
    success: boolean;
    data: {
        resources: Array<{
            resourceId: number;
            name: string;
            domain: string;
            enabled: boolean;
            protected: boolean;
            protocol: string;
        }>;
        siteResources: Array<{
            siteResourceId: number;
            name: string;
            destination: string;
            mode: string;
            protocol: string | null;
            tcpPortRangeString: string | null;
            udpPortRangeString: string | null;
            disableIcmp: boolean | null;
            ssl: boolean;
            fullDomain: string | null;
            enabled: boolean;
            alias: string | null;
            aliasAddress: string | null;
            siteIds: number[];
            siteNames: string[];
            siteNiceIds: string[];
            siteAddresses: (string | null)[];
            siteOnlines: boolean[];
            type: "site";
        }>;
    };
};
