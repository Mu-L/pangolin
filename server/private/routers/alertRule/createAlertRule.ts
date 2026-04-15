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
import {
    alertRules,
    alertEmailActions,
    alertEmailRecipients,
    alertWebhookActions
} from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";

const paramsSchema = z.strictObject({
    orgId: z.string().nonempty()
});

const recipientSchema = z
    .strictObject({
        userId: z.string().optional(),
        roleId: z.string().optional(),
        email: z.string().email().optional()
    })
    .refine((r) => r.userId || r.roleId || r.email, {
        message: "Each recipient must have at least one of userId, roleId, or email"
    });

const emailActionSchema = z.strictObject({
    enabled: z.boolean().optional().default(true),
    recipients: z.array(recipientSchema).min(1)
});

const webhookActionSchema = z.strictObject({
    webhookUrl: z.string().url(),
    config: z.string().optional(),
    enabled: z.boolean().optional().default(true)
});

const bodySchema = z.strictObject({
    name: z.string().nonempty(),
    eventType: z.enum([
        "site_online",
        "site_offline",
        "health_check_healthy",
        "health_check_not_healthy"
    ]),
    siteId: z.number().int().optional(),
    healthCheckId: z.number().int().optional(),
    enabled: z.boolean().optional().default(true),
    cooldownSeconds: z.number().int().nonnegative().optional().default(300),
    emailAction: emailActionSchema.optional(),
    webhookActions: z.array(webhookActionSchema).optional()
});

export type CreateAlertRuleResponse = {
    alertRuleId: number;
};

registry.registerPath({
    method: "put",
    path: "/org/{orgId}/alert-rule",
    description: "Create an alert rule for a specific organization.",
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

export async function createAlertRule(
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
            eventType,
            siteId,
            healthCheckId,
            enabled,
            cooldownSeconds,
            emailAction,
            webhookActions
        } = parsedBody.data;

        const now = Date.now();

        const [rule] = await db
            .insert(alertRules)
            .values({
                orgId,
                name,
                eventType,
                siteId: siteId ?? null,
                healthCheckId: healthCheckId ?? null,
                enabled,
                cooldownSeconds,
                createdAt: now,
                updatedAt: now
            })
            .returning();

        if (emailAction) {
            const [emailActionRow] = await db
                .insert(alertEmailActions)
                .values({
                    alertRuleId: rule.alertRuleId,
                    enabled: emailAction.enabled
                })
                .returning();

            if (emailAction.recipients.length > 0) {
                await db.insert(alertEmailRecipients).values(
                    emailAction.recipients.map((r) => ({
                        emailActionId: emailActionRow.emailActionId,
                        userId: r.userId ?? null,
                        roleId: r.roleId ?? null,
                        email: r.email ?? null
                    }))
                );
            }
        }

        if (webhookActions && webhookActions.length > 0) {
            await db.insert(alertWebhookActions).values(
                webhookActions.map((wa) => ({
                    alertRuleId: rule.alertRuleId,
                    webhookUrl: wa.webhookUrl,
                    config: wa.config ?? null,
                    enabled: wa.enabled
                }))
            );
        }

        return response<CreateAlertRuleResponse>(res, {
            data: {
                alertRuleId: rule.alertRuleId
            },
            success: true,
            error: false,
            message: "Alert rule created successfully",
            status: HttpCode.CREATED
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}