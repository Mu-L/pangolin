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

import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db, statusHistory } from "@server/db";
import { and, eq, gte, asc } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import {
    computeBuckets,
    statusHistoryQuerySchema,
    StatusHistoryResponse
} from "@server/lib/statusHistory";

const healthCheckParamsSchema = z.object({
    healthCheckId: z.string().transform((v) => parseInt(v, 10))
});

export async function getHealthCheckStatusHistory(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = healthCheckParamsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }
        const parsedQuery = statusHistoryQuerySchema.safeParse(req.query);
        if (!parsedQuery.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedQuery.error).toString()
                )
            );
        }

        const entityType = "healthCheck";
        const entityId = parsedParams.data.healthCheckId;
        const { days } = parsedQuery.data;

        const nowSec = Math.floor(Date.now() / 1000);
        const startSec = nowSec - days * 86400;

        const events = await db
            .select()
            .from(statusHistory)
            .where(
                and(
                    eq(statusHistory.entityType, entityType),
                    eq(statusHistory.entityId, entityId),
                    gte(statusHistory.timestamp, startSec)
                )
            )
            .orderBy(asc(statusHistory.timestamp));

        const { buckets, totalDowntime } = computeBuckets(events, days);
        const totalWindow = days * 86400;
        const overallUptime =
            totalWindow > 0
                ? Math.max(
                      0,
                      ((totalWindow - totalDowntime) / totalWindow) * 100
                  )
                : 100;

        return response<StatusHistoryResponse>(res, {
            data: {
                entityType,
                entityId,
                days: buckets,
                overallUptimePercent: Math.round(overallUptime * 100) / 100,
                totalDowntimeSeconds: totalDowntime
            },
            success: true,
            error: false,
            message: "Status history retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
