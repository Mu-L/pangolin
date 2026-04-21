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
import { db, targetHealthCheck } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";

const paramsSchema = z.strictObject({
    orgId: z.string().nonempty()
});

const bodySchema = z.strictObject({
    name: z.string().nonempty(),
    siteId: z.number().int().positive(),
    hcEnabled: z.boolean().default(false),
    hcMode: z.string().default("http"),
    hcHostname: z.string().optional(),
    hcPort: z.number().int().min(1).max(65535).optional(),
    hcPath: z.string().optional(),
    hcScheme: z.string().optional(),
    hcMethod: z.string().default("GET"),
    hcInterval: z.number().int().positive().default(30),
    hcUnhealthyInterval: z.number().int().positive().default(30),
    hcTimeout: z.number().int().positive().default(5),
    hcHeaders: z.string().optional().nullable(),
    hcFollowRedirects: z.boolean().default(true),
    hcStatus: z.number().int().optional().nullable(),
    hcTlsServerName: z.string().optional(),
    hcHealthyThreshold: z.number().int().positive().default(1),
    hcUnhealthyThreshold: z.number().int().positive().default(1)
});

export type CreateHealthCheckResponse = {
    targetHealthCheckId: number;
};

registry.registerPath({
    method: "put",
    path: "/org/{orgId}/health-check",
    description: "Create a health check for a specific organization.",
    tags: [OpenAPITags.Org],
    request: {
        params: paramsSchema,
        body: {
            content: {
                "application/json": {
                    schema: bodySchema
                }
            }
        }
    },
    responses: {}
});

export async function createHealthCheck(
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

        const parsedBody = bodySchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const {
            name,
            siteId,
            hcEnabled,
            hcMode,
            hcHostname,
            hcPort,
            hcPath,
            hcScheme,
            hcMethod,
            hcInterval,
            hcUnhealthyInterval,
            hcTimeout,
            hcHeaders,
            hcFollowRedirects,
            hcStatus,
            hcTlsServerName,
            hcHealthyThreshold,
            hcUnhealthyThreshold
        } = parsedBody.data;

        const [record] = await db
            .insert(targetHealthCheck)
            .values({
                targetId: null,
                orgId,
                siteId,
                name,
                hcEnabled,
                hcMode,
                hcHostname: hcHostname ?? null,
                hcPort: hcPort ?? null,
                hcPath: hcPath ?? null,
                hcScheme: hcScheme ?? null,
                hcMethod,
                hcInterval,
                hcUnhealthyInterval,
                hcTimeout,
                hcHeaders: hcHeaders ?? null,
                hcFollowRedirects,
                hcStatus: hcStatus ?? null,
                hcTlsServerName: hcTlsServerName ?? null,
                hcHealthyThreshold,
                hcUnhealthyThreshold
            })
            .returning();

        return response<CreateHealthCheckResponse>(res, {
            data: {
                targetHealthCheckId: record.targetHealthCheckId
            },
            success: true,
            error: false,
            message: "Standalone health check created successfully",
            status: HttpCode.CREATED
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
