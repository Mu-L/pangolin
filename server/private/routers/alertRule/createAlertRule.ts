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
import { db } from "@server/db";
import {
    alertRules,
    alertSites,
    alertHealthChecks,
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

const SITE_EVENT_TYPES = ["site_online", "site_offline"] as const;
const HC_EVENT_TYPES = [
    "health_check_healthy",
    "health_check_not_healthy"
] as const;

const paramsSchema = z.strictObject({
    orgId: z.string().nonempty()
});

const webhookActionSchema = z.strictObject({
    webhookUrl: z.string().url(),
    config: z.string().optional(),
    enabled: z.boolean().optional().default(true)
});

const bodySchema = z
    .strictObject({
        name: z.string().nonempty(),
        eventType: z.enum([
            "site_online",
            "site_offline",
            "health_check_healthy",
            "health_check_not_healthy"
        ]),
        enabled: z.boolean().optional().default(true),
        cooldownSeconds: z.number().int().nonnegative().optional().default(300),
        // Source join tables - which is required depends on eventType
        siteIds: z.array(z.number().int().positive()).optional().default([]),
        healthCheckIds: z
            .array(z.number().int().positive())
            .optional()
            .default([]),
        // Email recipients (flat)
        userIds: z.array(z.string().nonempty()).optional().default([]),
        roleIds: z.array(z.string().nonempty()).optional().default([]),
        emails: z.array(z.string().email()).optional().default([]),
        // Webhook actions
        webhookActions: z.array(webhookActionSchema).optional().default([])
    })
    .superRefine((val, ctx) => {
        const isSiteEvent = (SITE_EVENT_TYPES as readonly string[]).includes(
            val.eventType
        );
        const isHcEvent = (HC_EVENT_TYPES as readonly string[]).includes(
            val.eventType
        );

        if (isSiteEvent && val.siteIds.length === 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message:
                    "At least one siteId is required for site event types",
                path: ["siteIds"]
            });
        }

        if (isHcEvent && val.healthCheckIds.length === 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message:
                    "At least one healthCheckId is required for health check event types",
                path: ["healthCheckIds"]
            });
        }

        if (isSiteEvent && val.healthCheckIds.length > 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "healthCheckIds must not be set for site event types",
                path: ["healthCheckIds"]
            });
        }

        if (isHcEvent && val.siteIds.length > 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message:
                    "siteIds must not be set for health check event types",
                path: ["siteIds"]
            });
        }
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
            enabled,
            cooldownSeconds,
            siteIds,
            healthCheckIds,
            userIds,
            roleIds,
            emails,
            webhookActions
        } = parsedBody.data;

        const now = Date.now();

        const [rule] = await db
            .insert(alertRules)
            .values({
                orgId,
                name,
                eventType,
                enabled,
                cooldownSeconds,
                createdAt: now,
                updatedAt: now
            })
            .returning();

        // Insert site associations
        if (siteIds.length > 0) {
            await db.insert(alertSites).values(
                siteIds.map((siteId) => ({
                    alertRuleId: rule.alertRuleId,
                    siteId
                }))
            );
        }

        // Insert health check associations
        if (healthCheckIds.length > 0) {
            await db.insert(alertHealthChecks).values(
                healthCheckIds.map((healthCheckId) => ({
                    alertRuleId: rule.alertRuleId,
                    healthCheckId
                }))
            );
        }

        // Create the email action pivot row and recipients if any recipients
        // were supplied (userIds, roleIds, or raw emails).
        const hasRecipients =
            userIds.length > 0 || roleIds.length > 0 || emails.length > 0;

        if (hasRecipients) {
            const [emailActionRow] = await db
                .insert(alertEmailActions)
                .values({ alertRuleId: rule.alertRuleId })
                .returning();

            const recipientRows = [
                ...userIds.map((userId) => ({
                    emailActionId: emailActionRow.emailActionId,
                    userId,
                    roleId: null as string | null,
                    email: null as string | null
                })),
                ...roleIds.map((roleId) => ({
                    emailActionId: emailActionRow.emailActionId,
                    userId: null as string | null,
                    roleId,
                    email: null as string | null
                })),
                ...emails.map((email) => ({
                    emailActionId: emailActionRow.emailActionId,
                    userId: null as string | null,
                    roleId: null as string | null,
                    email
                }))
            ];

            await db.insert(alertEmailRecipients).values(recipientRows);
        }

        if (webhookActions.length > 0) {
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