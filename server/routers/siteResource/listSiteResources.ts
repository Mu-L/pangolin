import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import { siteResources, sites, SiteResource } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import { and, asc, desc, eq } from "drizzle-orm";
import { fromError } from "zod-validation-error";
import logger from "@server/logger";
import { OpenAPITags, registry } from "@server/openApi";

const listSiteResourcesParamsSchema = z.strictObject({
    siteId: z.string().transform(Number).pipe(z.int().positive()),
    orgId: z.string()
});

const listSiteResourcesQuerySchema = z.object({
    limit: z
        .string()
        .optional()
        .default("100")
        .transform(Number)
        .pipe(z.int().positive()),
    offset: z
        .string()
        .optional()
        .default("0")
        .transform(Number)
        .pipe(z.int().nonnegative()),
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

export type ListSiteResourcesResponse = {
    siteResources: SiteResource[];
};

registry.registerPath({
    method: "get",
    path: "/org/{orgId}/site/{siteId}/resources",
    description: "List site resources for a site.",
    tags: [OpenAPITags.Client, OpenAPITags.Org],
    request: {
        params: listSiteResourcesParamsSchema,
        query: listSiteResourcesQuerySchema
    },
    responses: {}
});

export async function listSiteResources(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = listSiteResourcesParamsSchema.safeParse(
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

        const parsedQuery = listSiteResourcesQuerySchema.safeParse(req.query);
        if (!parsedQuery.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedQuery.error).toString()
                )
            );
        }

        const { siteId, orgId } = parsedParams.data;
        const { limit, offset, sort_by, order } = parsedQuery.data;

        // Verify the site exists and belongs to the org
        const site = await db
            .select()
            .from(sites)
            .where(and(eq(sites.siteId, siteId), eq(sites.orgId, orgId)))
            .limit(1);

        if (site.length === 0) {
            return next(createHttpError(HttpCode.NOT_FOUND, "Site not found"));
        }

        // Get site resources
        const siteResourcesList = await db
            .select()
            .from(siteResources)
            .where(
                and(
                    eq(siteResources.siteId, siteId),
                    eq(siteResources.orgId, orgId)
                )
            )
            .orderBy(
                sort_by
                    ? order === "asc"
                        ? asc(siteResources[sort_by])
                        : desc(siteResources[sort_by])
                    : asc(siteResources.siteResourceId)
            )
            .limit(limit)
            .offset(offset);

        return response(res, {
            data: { siteResources: siteResourcesList },
            success: true,
            error: false,
            message: "Site resources retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error("Error listing site resources:", error);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Failed to list site resources"
            )
        );
    }
}
