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
import { and, eq } from "drizzle-orm";

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

const bodySchema = z.strictObject({
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
    siteId: z.number().int().nullable().optional(),
    healthCheckId: z.number().int().nullable().optional(),
    enabled: z.boolean().optional(),
    cooldownSeconds: z.number().int().nonnegative().optional(),
    // Recipient arrays - if any are provided the full recipient set is replaced
    userIds: z.array(z.string().nonempty()).optional(),
    roleIds: z.array(z.string().nonempty()).optional(),
    emails: z.array(z.string().email()).optional(),
    // Webhook actions - if provided the full webhook set is replaced
    webhookActions: z.array(webhookActionSchema).optional()
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
            cooldownSeconds,
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

        // --- Full-replace recipients if any recipient array was provided ---
        const recipientsProvided =
            userIds !== undefined ||
            roleIds !== undefined ||
            emails !== undefined;

        if (recipientsProvided) {
            // Build the flat list of recipient rows to insert
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

            // Find or create the single emailAction row for this rule
            const [existingEmailAction] = await db
                .select()
                .from(alertEmailActions)
                .where(eq(alertEmailActions.alertRuleId, alertRuleId));

            if (existingEmailAction) {
                // Delete all current recipients then re-insert
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
                // No emailAction exists yet - create one then insert recipients
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