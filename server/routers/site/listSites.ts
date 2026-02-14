import {
    db,
    exitNodes,
    newts,
    orgs,
    remoteExitNodes,
    roleSites,
    sites,
    userSites
} from "@server/db";
import cache from "@server/lib/cache";
import response from "@server/lib/response";
import logger from "@server/logger";
import { OpenAPITags, registry } from "@server/openApi";
import HttpCode from "@server/types/HttpCode";
import type { PaginatedResponse } from "@server/types/Pagination";
import { and, asc, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";
import createHttpError from "http-errors";
import semver from "semver";
import { z } from "zod";
import { fromError } from "zod-validation-error";

async function getLatestNewtVersion(): Promise<string | null> {
    try {
        const cachedVersion = cache.get<string>("latestNewtVersion");
        if (cachedVersion) {
            return cachedVersion;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500); // Reduced timeout to 1.5 seconds

        const response = await fetch(
            "https://api.github.com/repos/fosrl/newt/tags",
            {
                signal: controller.signal
            }
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
            logger.warn(
                `Failed to fetch latest Newt version from GitHub: ${response.status} ${response.statusText}`
            );
            return null;
        }

        let tags = await response.json();
        if (!Array.isArray(tags) || tags.length === 0) {
            logger.warn("No tags found for Newt repository");
            return null;
        }
        tags = tags.filter((version) => !version.name.includes("rc"));
        const latestVersion = tags[0].name;

        cache.set("latestNewtVersion", latestVersion);

        return latestVersion;
    } catch (error: any) {
        if (error.name === "AbortError") {
            logger.warn(
                "Request to fetch latest Newt version timed out (1.5s)"
            );
        } else if (error.cause?.code === "UND_ERR_CONNECT_TIMEOUT") {
            logger.warn(
                "Connection timeout while fetching latest Newt version"
            );
        } else {
            logger.warn(
                "Error fetching latest Newt version:",
                error.message || error
            );
        }
        return null;
    }
}

const listSitesParamsSchema = z.strictObject({
    orgId: z.string()
});

const listSitesSchema = z.object({
    pageSize: z.coerce
        .number<string>() // for prettier formatting
        .int()
        .positive()
        .optional()
        .catch(20)
        .default(20)
        .openapi({
            type: "integer",
            default: 20,
            description: "Number of items per page"
        }),
    page: z.coerce
        .number<string>() // for prettier formatting
        .int()
        .min(0)
        .optional()
        .catch(1)
        .default(1)
        .openapi({
            type: "integer",
            default: 1,
            description: "Page number to retrieve"
        }),
    query: z.string().optional(),
    sort_by: z
        .enum(["megabytesIn", "megabytesOut"])
        .optional()
        .catch(undefined)
        .openapi({
            type: "string",
            enum: ["megabytesIn", "megabytesOut"],
            description: "Field to sort by"
        }),
    order: z
        .enum(["asc", "desc"])
        .optional()
        .default("asc")
        .catch("asc")
        .openapi({
            type: "string",
            enum: ["asc", "desc"],
            default: "asc",
            description: "Sort order"
        }),
    online: z
        .enum(["true", "false"])
        .transform((v) => v === "true")
        .optional()
        .catch(undefined)
        .openapi({
            type: "boolean",
            description: "Filter by online status"
        })
});

function querySitesBase() {
    return db
        .select({
            siteId: sites.siteId,
            niceId: sites.niceId,
            name: sites.name,
            pubKey: sites.pubKey,
            subnet: sites.subnet,
            megabytesIn: sites.megabytesIn,
            megabytesOut: sites.megabytesOut,
            orgName: orgs.name,
            type: sites.type,
            online: sites.online,
            address: sites.address,
            newtVersion: newts.version,
            exitNodeId: sites.exitNodeId,
            exitNodeName: exitNodes.name,
            exitNodeEndpoint: exitNodes.endpoint,
            remoteExitNodeId: remoteExitNodes.remoteExitNodeId
        })
        .from(sites)
        .leftJoin(orgs, eq(sites.orgId, orgs.orgId))
        .leftJoin(newts, eq(newts.siteId, sites.siteId))
        .leftJoin(exitNodes, eq(exitNodes.exitNodeId, sites.exitNodeId))
        .leftJoin(
            remoteExitNodes,
            eq(remoteExitNodes.exitNodeId, sites.exitNodeId)
        );
}

type SiteWithUpdateAvailable = Awaited<ReturnType<typeof querySitesBase>>[0] & {
    newtUpdateAvailable?: boolean;
};

export type ListSitesResponse = PaginatedResponse<{
    sites: SiteWithUpdateAvailable[];
}>;

registry.registerPath({
    method: "get",
    path: "/org/{orgId}/sites",
    description: "List all sites in an organization",
    tags: [OpenAPITags.Org, OpenAPITags.Site],
    request: {
        params: listSitesParamsSchema,
        query: listSitesSchema
    },
    responses: {}
});

export async function listSites(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedQuery = listSitesSchema.safeParse(req.query);
        if (!parsedQuery.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedQuery.error)
                )
            );
        }

        const parsedParams = listSitesParamsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error)
                )
            );
        }
        const { orgId } = parsedParams.data;

        if (req.user && orgId && orgId !== req.userOrgId) {
            return next(
                createHttpError(
                    HttpCode.FORBIDDEN,
                    "User does not have access to this organization"
                )
            );
        }

        let accessibleSites;
        if (req.user) {
            accessibleSites = await db
                .select({
                    siteId: sql<number>`COALESCE(${userSites.siteId}, ${roleSites.siteId})`
                })
                .from(userSites)
                .fullJoin(roleSites, eq(userSites.siteId, roleSites.siteId))
                .where(
                    or(
                        eq(userSites.userId, req.user!.userId),
                        eq(roleSites.roleId, req.userOrgRoleId!)
                    )
                );
        } else {
            accessibleSites = await db
                .select({ siteId: sites.siteId })
                .from(sites)
                .where(eq(sites.orgId, orgId));
        }

        const { pageSize, page, query, sort_by, order, online } =
            parsedQuery.data;

        const accessibleSiteIds = accessibleSites.map((site) => site.siteId);

        const conditions = [
            and(
                inArray(sites.siteId, accessibleSiteIds),
                eq(sites.orgId, orgId)
            )
        ];
        if (query) {
            conditions.push(
                or(
                    like(
                        sql`LOWER(${sites.name})`,
                        "%" + query.toLowerCase() + "%"
                    ),
                    like(
                        sql`LOWER(${sites.niceId})`,
                        "%" + query.toLowerCase() + "%"
                    )
                )
            );
        }
        if (typeof online !== "undefined") {
            conditions.push(eq(sites.online, online));
        }

        const baseQuery = querySitesBase().where(and(...conditions));

        // we need to add `as` so that drizzle filters the result as a subquery
        const countQuery = db.$count(
            querySitesBase().where(and(...conditions))
        );

        const siteListQuery = baseQuery
            .limit(pageSize)
            .offset(pageSize * (page - 1))
            .orderBy(
                sort_by
                    ? order === "asc"
                        ? asc(sites[sort_by])
                        : desc(sites[sort_by])
                    : asc(sites.siteId)
            );

        const [totalCount, rows] = await Promise.all([
            countQuery,
            siteListQuery
        ]);

        // Get latest version asynchronously without blocking the response
        const latestNewtVersionPromise = getLatestNewtVersion();

        const sitesWithUpdates: SiteWithUpdateAvailable[] = rows.map((site) => {
            const siteWithUpdate: SiteWithUpdateAvailable = { ...site };
            // Initially set to false, will be updated if version check succeeds
            siteWithUpdate.newtUpdateAvailable = false;
            return siteWithUpdate;
        });

        // Try to get the latest version, but don't block if it fails
        try {
            const latestNewtVersion = await latestNewtVersionPromise;

            if (latestNewtVersion) {
                sitesWithUpdates.forEach((site) => {
                    if (
                        site.type === "newt" &&
                        site.newtVersion &&
                        latestNewtVersion
                    ) {
                        try {
                            site.newtUpdateAvailable = semver.lt(
                                site.newtVersion,
                                latestNewtVersion
                            );
                        } catch (error) {
                            site.newtUpdateAvailable = false;
                        }
                    }
                });
            }
        } catch (error) {
            // Log the error but don't let it block the response
            logger.warn(
                "Failed to check for Newt updates, continuing without update info:",
                error
            );
        }

        return response<ListSitesResponse>(res, {
            data: {
                sites: sitesWithUpdates,
                pagination: {
                    total: totalCount,
                    pageSize,
                    page
                }
            },
            success: true,
            error: false,
            message: "Sites retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
