import { db, targetHealthCheck, targets, resources } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { OpenAPITags, registry } from "@server/openApi";
import { eq, sql, inArray } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const listHealthChecksParamsSchema = z.strictObject({
    orgId: z.string().nonempty()
});

const listHealthChecksSchema = z.object({
    limit: z
        .string()
        .optional()
        .default("1000")
        .transform(Number)
        .pipe(z.int().positive()),
    offset: z
        .string()
        .optional()
        .default("0")
        .transform(Number)
        .pipe(z.int().nonnegative())
});

export type ListHealthChecksResponse = {
    healthChecks: {
        targetHealthCheckId: number;
        resourceId: number;
        resourceName: string;
        hcEnabled: boolean;
        hcHealth: "unknown" | "healthy" | "unhealthy";
    }[];
    pagination: {
        total: number;
        limit: number;
        offset: number;
    };
};

registry.registerPath({
    method: "get",
    path: "/org/{orgId}/health-checks",
    description: "List health checks for all resources in an organization.",
    tags: [OpenAPITags.Org, OpenAPITags.PublicResource],
    request: {
        params: listHealthChecksParamsSchema,
        query: listHealthChecksSchema
    },
    responses: {}
});

export async function listHealthChecks(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedQuery = listHealthChecksSchema.safeParse(req.query);
        if (!parsedQuery.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedQuery.error)
                )
            );
        }
        const { limit, offset } = parsedQuery.data;

        const parsedParams = listHealthChecksParamsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error)
                )
            );
        }
        const { orgId } = parsedParams.data;

        const list = await db
            .select({
                targetHealthCheckId: targetHealthCheck.targetHealthCheckId,
                resourceId: resources.resourceId,
                resourceName: resources.name,
                hcEnabled: targetHealthCheck.hcEnabled,
                hcHealth: targetHealthCheck.hcHealth
            })
            .from(targetHealthCheck)
            .innerJoin(targets, eq(targets.targetId, targetHealthCheck.targetId))
            .innerJoin(resources, eq(resources.resourceId, targets.resourceId))
            .where(eq(resources.orgId, orgId))
            .orderBy(sql`${resources.name} ASC`)
            .limit(limit)
            .offset(offset);

        const [{ count }] = await db
            .select({ count: sql<number>`count(*)` })
            .from(targetHealthCheck)
            .innerJoin(targets, eq(targets.targetId, targetHealthCheck.targetId))
            .innerJoin(resources, eq(resources.resourceId, targets.resourceId))
            .where(eq(resources.orgId, orgId));

        return response<ListHealthChecksResponse>(res, {
            data: {
                healthChecks: list.map((row) => ({
                    targetHealthCheckId: row.targetHealthCheckId,
                    resourceId: row.resourceId,
                    resourceName: row.resourceName,
                    hcEnabled: row.hcEnabled,
                    hcHealth: (row.hcHealth ?? "unknown") as
                        | "unknown"
                        | "healthy"
                        | "unhealthy"
                })),
                pagination: {
                    total: count,
                    limit,
                    offset
                }
            },
            success: true,
            error: false,
            message: "Health checks retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}