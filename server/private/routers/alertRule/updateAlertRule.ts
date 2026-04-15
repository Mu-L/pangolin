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
import { and, eq } from "drizzle-orm";

const SITE_EVENT_TYPES = ["site_online", "site_offline"] as const;
const HC_EVENT_TYPES = [
    "health_check_healthy",
    "health_check_not_healthy"
] as const;

const paramsSchema = z
    .object({
        orgId: z.string().nonempty(),
        alertRuleId: z.coerce.number<number>()
    })
    .strict();

const webhookActionSchema = z.strictObject({
    webhookUrl: z.string().url(),
    config: z.string().optional(),
    enabled: z.boolean().optional().default(true)
});

const bodySchema = z
    .strictObject({
        // Alert rule fields - all optional for partial updates
        name: z.string().nonempty().optional(),
        eventType: z
            .enum([
                "site_online",
                "site_offline",
                "health_check_healthy",
                "health_check_not_healthy"
            ])
            .optional(),
        enabled: z.boolean().optional(),
        cooldownSeconds: z.number().int().nonnegative().optional(),
        // Source join tables - if provided the full set is replaced
        siteIds: z.array(z.number().int().positive()).optional(),
        healthCheckIds: z.array(z.number().int().positive()).optional(),
        // Recipient arrays - if any are provided the full recipient set is replaced
        userIds: z.array(z.string().nonempty()).optional(),
        roleIds: z.array(z.string().nonempty()).optional(),
        emails: z.array(z.string().email()).optional(),
        // Webhook actions - if provided the full webhook set is replaced
        webhookActions: z.array(webhookActionSchema).optional()
    })
    .superRefine((val, ctx) => {
        if (!val.eventType) return;

        const isSiteEvent = (SITE_EVENT_TYPES as readonly string[]).includes(
            val.eventType
        );
        const isHcEvent = (HC_EVENT_TYPES as readonly string[]).includes(
            val.eventType
        );

        if (isSiteEvent && val.healthCheckIds !== undefined && val.healthCheckIds.length > 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "healthCheckIds must not be set for site event types",
                path: ["healthCheckIds"]
            });
        }

        if (isHcEvent && val.siteIds !== undefined && val.siteIds.length > 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "siteIds must not be set for health check event types",
                path: ["siteIds"]
            });
        }
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
            enabled,
            cooldownSeconds,
            siteIds,
            healthCheckIds,
            userIds,
            roleIds,
            emails,
            webhookActions
        } = parsedBody.data;

        // --- Update rule fields ---
        const updateData: Record<string, unknown> = {
            updatedAt: Date.now()
        };

        if (name !== undefined) updateData.name = name;
        if (eventType !== undefined) updateData.eventType = eventType;
        if (enabled !== undefined) updateData.enabled = enabled;
        if (cooldownSeconds !== undefined)
            updateData.cooldownSeconds = cooldownSeconds;

        await db
            .update(alertRules)
            .set(updateData)
            .where(
                and(
                    eq(alertRules.alertRuleId, alertRuleId),
                    eq(alertRules.orgId, orgId)
                )
            );

        // --- Full-replace site associations if siteIds was provided ---
        if (siteIds !== undefined) {
            await db
                .delete(alertSites)
                .where(eq(alertSites.alertRuleId, alertRuleId));

            if (siteIds.length > 0) {
                await db.insert(alertSites).values(
                    siteIds.map((siteId) => ({
                        alertRuleId,
                        siteId
                    }))
                );
            }
        }

        // --- Full-replace health check associations if healthCheckIds was provided ---
        if (healthCheckIds !== undefined) {
            await db
                .delete(alertHealthChecks)
                .where(eq(alertHealthChecks.alertRuleId, alertRuleId));

            if (healthCheckIds.length > 0) {
                await db.insert(alertHealthChecks).values(
                    healthCheckIds.map((healthCheckId) => ({
                        alertRuleId,
                        healthCheckId
                    }))
                );
            }
        }

        // --- Full-replace recipients if any recipient array was provided ---
        const recipientsProvided =
            userIds !== undefined ||
            roleIds !== undefined ||
            emails !== undefined;

        if (recipientsProvided) {
            const newRecipients = [
                ...(userIds ?? []).map((userId) => ({
                    userId,
                    roleId: null as string | null,
                    email: null as string | null
                })),
                ...(roleIds ?? []).map((roleId) => ({
                    userId: null as string | null,
                    roleId,
                    email: null as string | null
                })),
                ...(emails ?? []).map((email) => ({
                    userId: null as string | null,
                    roleId: null as string | null,
                    email
                }))
            ];

            const [existingEmailAction] = await db
                .select()
                .from(alertEmailActions)
                .where(eq(alertEmailActions.alertRuleId, alertRuleId));

            if (existingEmailAction) {
                await db
                    .delete(alertEmailRecipients)
                    .where(
                        eq(
                            alertEmailRecipients.emailActionId,
                            existingEmailAction.emailActionId
                        )
                    );

                if (newRecipients.length > 0) {
                    await db.insert(alertEmailRecipients).values(
                        newRecipients.map((r) => ({
                            emailActionId: existingEmailAction.emailActionId,
                            ...r
                        }))
                    );
                }
            } else if (newRecipients.length > 0) {
                const [emailActionRow] = await db
                    .insert(alertEmailActions)
                    .values({ alertRuleId, enabled: true })
                    .returning();

                await db.insert(alertEmailRecipients).values(
                    newRecipients.map((r) => ({
                        emailActionId: emailActionRow.emailActionId,
                        ...r
                    }))
                );
            }
        }

        // --- Full-replace webhook actions if the array was provided ---
        if (webhookActions !== undefined) {
            await db
                .delete(alertWebhookActions)
                .where(eq(alertWebhookActions.alertRuleId, alertRuleId));

            if (webhookActions.length > 0) {
                await db.insert(alertWebhookActions).values(
                    webhookActions.map((wa) => ({
                        alertRuleId,
                        webhookUrl: wa.webhookUrl,
                        config: wa.config ?? null,
                        enabled: wa.enabled
                    }))
                );
            }
        }

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