/*
 * This file is part of a proprietary work.
 *
 * Copyright (c) 2025 Fossorial, Inc.
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
import { db } from "@server/db";
import { alertRules } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";
import { and, eq } from "drizzle-orm";

const paramsSchema = z
    .object({
        orgId: z.string().nonempty(),
        alertRuleId: z.coerce.number<number>()
    })
    .strict();

const bodySchema = z.strictObject({
    name: z.string().nonempty().optional(),
    eventType: z
        .enum([
            "site_online",
            "site_offline",
            "health_check_healthy",
            "health_check_not_healthy"
        ])
        .optional(),
    siteId: z.number().int().nullable().optional(),
    healthCheckId: z.number().int().nullable().optional(),
    enabled: z.boolean().optional(),
    cooldownSeconds: z.number().int().nonnegative().optional()
});

export type UpdateAlertRuleResponse = {
    alertRuleId: number;
};

registry.registerPath({
    method: "post",
    path: "/org/{orgId}/alert-rule/{alertRuleId}",
    description: "Update an alert rule for a specific organization.",
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

export async function updateAlertRule(
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

        const { orgId, alertRuleId } = parsedParams.data;

        const parsedBody = bodySchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const [existing] = await db
            .select()
            .from(alertRules)
            .where(
                and(
                    eq(alertRules.alertRuleId, alertRuleId),
                    eq(alertRules.orgId, orgId)
                )
            );

        if (!existing) {
            return next(
                createHttpError(HttpCode.NOT_FOUND, "Alert rule not found")
            );
        }

        const {
            name,
            eventType,
            siteId,
            healthCheckId,
            enabled,
            cooldownSeconds
        } = parsedBody.data;

        const updateData: Record<string, unknown> = {
            updatedAt: Date.now()
        };

        if (name !== undefined) updateData.name = name;
        if (eventType !== undefined) updateData.eventType = eventType;
        if (siteId !== undefined) updateData.siteId = siteId;
        if (healthCheckId !== undefined) updateData.healthCheckId = healthCheckId;
        if (enabled !== undefined) updateData.enabled = enabled;
        if (cooldownSeconds !== undefined) updateData.cooldownSeconds = cooldownSeconds;

        await db
            .update(alertRules)
            .set(updateData)
            .where(
                and(
                    eq(alertRules.alertRuleId, alertRuleId),
                    eq(alertRules.orgId, orgId)
                )
            );

        return response<UpdateAlertRuleResponse>(res, {
            data: {
                alertRuleId
            },
            success: true,
            error: false,
            message: "Alert rule updated successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}