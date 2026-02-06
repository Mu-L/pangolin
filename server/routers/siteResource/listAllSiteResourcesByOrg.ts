import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db, resources } from "@server/db";
import { siteResources, sites, SiteResource } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import { eq, and, asc, ilike, or } from "drizzle-orm";
import { fromError } from "zod-validation-error";
import logger from "@server/logger";
import { OpenAPITags, registry } from "@server/openApi";
import type { PaginatedResponse } from "@server/types/Pagination";

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
        .default(20),
    page: z.coerce
        .number<string>() // for prettier formatting
        .int()
        .min(0)
        .optional()
        .catch(1)
        .default(1),
    query: z.string().optional(),
    mode: z.enum(["host", "cidr"]).optional().catch(undefined)
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
                    ilike(siteResources.name, "%" + query + "%"),
                    ilike(siteResources.destination, "%" + query + "%"),
                    ilike(siteResources.alias, "%" + query + "%"),
                    ilike(siteResources.aliasAddress, "%" + query + "%"),
                    ilike(sites.name, "%" + query + "%")
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
