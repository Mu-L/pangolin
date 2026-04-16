/*
 * This file is part of a proprietary work.
 *
 * Copyright (c) 2025-2026 Fossorial, Inc.
 * All rights reserved.
 *
 * This file is licensed under the Fossorial Commercial License.
 * You may not use this file except in compliance with the License.
 * Unauthorized use, copying, modification, or distribution is strictly prohibited.
 *
 * This file is not licensed under the AGPLv3.
 */

import { db, targetHealthCheck } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { OpenAPITags, registry } from "@server/openApi";
import { and, eq, isNull, sql } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { fromError } from "zod-validation-error";
import { ListHealthChecksResponse } from "@server/routers/healthChecks/types";

const paramsSchema = z.strictObject({
    orgId: z.string().nonempty()
});

const querySchema = z.object({
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

registry.registerPath({
    method: "get",
    path: "/org/{orgId}/health-checks",
    description: "List health checks for an organization.",
    tags: [OpenAPITags.Org],
    request: {
        params: paramsSchema,
        query: querySchema
    },
    responses: {}
});

export async function listHealthChecks(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = paramsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }
        const { orgId } = parsedParams.data;

        const parsedQuery = querySchema.safeParse(req.query);
        if (!parsedQuery.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedQuery.error).toString()
                )
            );
        }
        const { limit, offset } = parsedQuery.data;

        const whereClause = and(
            eq(targetHealthCheck.orgId, orgId),
            isNull(targetHealthCheck.targetId)
        );

        const list = await db
            .select()
            .from(targetHealthCheck)
            .where(whereClause)
            .orderBy(sql`${targetHealthCheck.targetHealthCheckId} DESC`)
            .limit(limit)
            .offset(offset);

        const [{ count }] = await db
            .select({ count: sql<number>`count(*)` })
            .from(targetHealthCheck)
            .where(whereClause);

        return response<ListHealthChecksResponse>(res, {
            data: {
                healthChecks: list.map((row) => ({
                    targetHealthCheckId: row.targetHealthCheckId,
                    name: row.name ?? "",
                    hcEnabled: row.hcEnabled,
                    hcHealth: (row.hcHealth ?? "unknown") as
                        | "unknown"
                        | "healthy"
                        | "unhealthy",
                    hcMode: row.hcMode ?? null,
                    hcHostname: row.hcHostname ?? null,
                    hcPort: row.hcPort ?? null,
                    hcPath: row.hcPath ?? null,
                    hcScheme: row.hcScheme ?? null,
                    hcMethod: row.hcMethod ?? null,
                    hcInterval: row.hcInterval ?? null,
                    hcUnhealthyInterval: row.hcUnhealthyInterval ?? null,
                    hcTimeout: row.hcTimeout ?? null,
                    hcHeaders: row.hcHeaders ?? null,
                    hcFollowRedirects: row.hcFollowRedirects ?? null,
                    hcStatus: row.hcStatus ?? null,
                    hcTlsServerName: row.hcTlsServerName ?? null,
                    hcHealthyThreshold: row.hcHealthyThreshold ?? null,
                    hcUnhealthyThreshold: row.hcUnhealthyThreshold ?? null
                })),
                pagination: {
                    total: count,
                    limit,
                    offset
                }
            },
            success: true,
            error: false,
            message: "Standalone health checks retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
