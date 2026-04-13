import { db, SiteResource, siteNetworks, siteResources, sites } from "@server/db";
import response from "@server/lib/response";
import logger from "@server/logger";
import { OpenAPITags, registry } from "@server/openApi";
import HttpCode from "@server/types/HttpCode";
import type { PaginatedResponse } from "@server/types/Pagination";
import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";
import createHttpError from "http-errors";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const listAllSiteResourcesByOrgParamsSchema = z.strictObject({
    orgId: z.string()
});

const listAllSiteResourcesByOrgQuerySchema = z.object({
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
    mode: z
        .enum(["host", "cidr", "http"])
        .optional()
        .catch(undefined)
        .openapi({
            type: "string",
            enum: ["host", "cidr", "http"],
            description: "Filter site resources by mode"
        }),
    sort_by: z
        .enum(["name"])
        .optional()
        .catch(undefined)
        .openapi({
            type: "string",
            enum: ["name"],
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
        })
});

export type ListAllSiteResourcesByOrgResponse = PaginatedResponse<{
    siteResources: (SiteResource & {
        siteOnlines: boolean[];
        siteIds: number[];
        siteNames: string[];
        siteNiceIds: string[];
        siteAddresses: (string | null)[];
    })[];
}>;

function querySiteResourcesBase() {
    return db
        .select({
            siteResourceId: siteResources.siteResourceId,
            orgId: siteResources.orgId,
            niceId: siteResources.niceId,
            name: siteResources.name,
            mode: siteResources.mode,
            ssl: siteResources.ssl,
            scheme: siteResources.scheme,
            proxyPort: siteResources.proxyPort,
            destinationPort: siteResources.destinationPort,
            destination: siteResources.destination,
            enabled: siteResources.enabled,
            alias: siteResources.alias,
            aliasAddress: siteResources.aliasAddress,
            tcpPortRangeString: siteResources.tcpPortRangeString,
            udpPortRangeString: siteResources.udpPortRangeString,
            disableIcmp: siteResources.disableIcmp,
            authDaemonMode: siteResources.authDaemonMode,
            authDaemonPort: siteResources.authDaemonPort,
            subdomain: siteResources.subdomain,
            domainId: siteResources.domainId,
            fullDomain: siteResources.fullDomain,
            networkId: siteResources.networkId,
            defaultNetworkId: siteResources.defaultNetworkId,
            siteNames: sql<string[]>`array_agg(${sites.name})`,
            siteNiceIds: sql<string[]>`array_agg(${sites.niceId})`,
            siteIds: sql<number[]>`array_agg(${sites.siteId})`,
            siteAddresses: sql<(string | null)[]>`array_agg(${sites.address})`,
            siteOnlines: sql<boolean[]>`array_agg(${sites.online})`
        })
        .from(siteResources)
        .innerJoin(siteNetworks, eq(siteResources.networkId, siteNetworks.networkId))
        .innerJoin(sites, eq(siteNetworks.siteId, sites.siteId))
        .groupBy(siteResources.siteResourceId);
}


registry.registerPath({
    method: "get",
    path: "/org/{orgId}/site-resources",
    description: "List all site resources for an organization.",
    tags: [OpenAPITags.PrivateResource],
    request: {
        params: listAllSiteResourcesByOrgParamsSchema,
        query: listAllSiteResourcesByOrgQuerySchema
    },
    responses: {}
});

export async function listAllSiteResourcesByOrg(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = listAllSiteResourcesByOrgParamsSchema.safeParse(
            req.params
        );
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const parsedQuery = listAllSiteResourcesByOrgQuerySchema.safeParse(
            req.query
        );
        if (!parsedQuery.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedQuery.error).toString()
                )
            );
        }

        const { orgId } = parsedParams.data;
        const { page, pageSize, query, mode, sort_by, order } =
            parsedQuery.data;

        const conditions = [and(eq(siteResources.orgId, orgId))];
        if (query) {
            conditions.push(
                or(
                    like(
                        sql`LOWER(${siteResources.name})`,
                        "%" + query.toLowerCase() + "%"
                    ),
                    like(
                        sql`LOWER(${siteResources.niceId})`,
                        "%" + query.toLowerCase() + "%"
                    ),
                    like(
                        sql`LOWER(${siteResources.destination})`,
                        "%" + query.toLowerCase() + "%"
                    ),
                    like(
                        sql`LOWER(${siteResources.alias})`,
                        "%" + query.toLowerCase() + "%"
                    ),
                    like(
                        sql`LOWER(${siteResources.aliasAddress})`,
                        "%" + query.toLowerCase() + "%"
                    ),
                    like(
                        sql`LOWER(${sites.name})`,
                        "%" + query.toLowerCase() + "%"
                    )
                )
            );
        }

        if (mode) {
            conditions.push(eq(siteResources.mode, mode));
        }

        const baseQuery = querySiteResourcesBase().where(and(...conditions));

        const countQuery = db.$count(
            querySiteResourcesBase()
                .where(and(...conditions))
                .as("filtered_site_resources")
        );

        const [siteResourcesList, totalCount] = await Promise.all([
            baseQuery
                .limit(pageSize)
                .offset(pageSize * (page - 1))
                .orderBy(
                    sort_by
                        ? order === "asc"
                            ? asc(siteResources[sort_by])
                            : desc(siteResources[sort_by])
                        : asc(siteResources.name)
                ),
            countQuery
        ]);

        return response<ListAllSiteResourcesByOrgResponse>(res, {
            data: {
                siteResources: siteResourcesList,
                pagination: {
                    total: totalCount,
                    pageSize,
                    page
                }
            },
            success: true,
            error: false,
            message: "Site resources retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error("Error listing all site resources by org:", error);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Failed to list site resources"
            )
        );
    }
}
