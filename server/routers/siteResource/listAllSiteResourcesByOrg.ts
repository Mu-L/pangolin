import { db, SiteResource, siteResources, sites } from "@server/db";
import response from "@server/lib/response";
import logger from "@server/logger";
import { OpenAPITags, registry } from "@server/openApi";
import HttpCode from "@server/types/HttpCode";
import type { PaginatedResponse } from "@server/types/Pagination";
import { and, asc, eq, like, or, sql } from "drizzle-orm";
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
        .enum(["host", "cidr"])
        .optional()
        .catch(undefined)
        .openapi({
            type: "string",
            enum: ["host", "cidr"],
            description: "Filter site resources by mode"
        })
});

export type ListAllSiteResourcesByOrgResponse = PaginatedResponse<{
    siteResources: (SiteResource & {
        siteName: string;
        siteNiceId: string;
        siteAddress: string | null;
    })[];
}>;

function querySiteResourcesBase() {
    return db
        .select({
            siteResourceId: siteResources.siteResourceId,
            siteId: siteResources.siteId,
            orgId: siteResources.orgId,
            niceId: siteResources.niceId,
            name: siteResources.name,
            mode: siteResources.mode,
            protocol: siteResources.protocol,
            proxyPort: siteResources.proxyPort,
            destinationPort: siteResources.destinationPort,
            destination: siteResources.destination,
            enabled: siteResources.enabled,
            alias: siteResources.alias,
            aliasAddress: siteResources.aliasAddress,
            tcpPortRangeString: siteResources.tcpPortRangeString,
            udpPortRangeString: siteResources.udpPortRangeString,
            disableIcmp: siteResources.disableIcmp,
            siteName: sites.name,
            siteNiceId: sites.niceId,
            siteAddress: sites.address
        })
        .from(siteResources)
        .innerJoin(sites, eq(siteResources.siteId, sites.siteId));
}

registry.registerPath({
    method: "get",
    path: "/org/{orgId}/site-resources",
    description: "List all site resources for an organization.",
    tags: [OpenAPITags.Client, OpenAPITags.Org],
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
        const { page, pageSize, query, mode } = parsedQuery.data;

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
            querySiteResourcesBase().where(and(...conditions))
        );

        const [siteResourcesList, totalCount] = await Promise.all([
            baseQuery
                .limit(pageSize)
                .offset(pageSize * (page - 1))
                .orderBy(asc(siteResources.siteResourceId)),
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
