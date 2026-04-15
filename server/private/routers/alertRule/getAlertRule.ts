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

export type GetAlertRuleResponse = {
    alertRuleId: number;
    orgId: string;
    name: string;
    eventType:
        | "site_online"
        | "site_offline"
        | "health_check_healthy"
        | "health_check_not_healthy";
    siteId: number | null;
    healthCheckId: number | null;
    enabled: boolean;
    cooldownSeconds: number;
    lastTriggeredAt: number | null;
    createdAt: number;
    updatedAt: number;
    recipients: {
        recipientId: number;
        userId: string | null;
        roleId: string | null;
        email: string | null;
    }[];
    webhookActions: {
        webhookActionId: number;
        webhookUrl: string;
        enabled: boolean;
        lastSentAt: number | null;
    }[];
};

registry.registerPath({
    method: "get",
    path: "/org/{orgId}/alert-rule/{alertRuleId}",
    description: "Get a specific alert rule for an organization.",
    tags: [OpenAPITags.Org],
    request: {
        params: paramsSchema
    },
    responses: {}
});

export async function getAlertRule(
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

        const [rule] = await db
            .select()
            .from(alertRules)
            .where(
                and(
                    eq(alertRules.alertRuleId, alertRuleId),
                    eq(alertRules.orgId, orgId)
                )
            );

        if (!rule) {
            return next(
                createHttpError(HttpCode.NOT_FOUND, "Alert rule not found")
            );
        }

        // Resolve the single email action row for this rule, then collect all
        // recipients into a flat list. The emailAction pivot row is an internal
        // implementation detail and is not surfaced to callers.
        const [emailAction] = await db
            .select()
            .from(alertEmailActions)
            .where(eq(alertEmailActions.alertRuleId, alertRuleId));

        let recipients: GetAlertRuleResponse["recipients"] = [];
        if (emailAction) {
            const rows = await db
                .select()
                .from(alertEmailRecipients)
                .where(
                    eq(
                        alertEmailRecipients.emailActionId,
                        emailAction.emailActionId
                    )
                );

            recipients = rows.map((r) => ({
                recipientId: r.recipientId,
                userId: r.userId ?? null,
                roleId: r.roleId ?? null,
                email: r.email ?? null
            }));
        }

        const webhooks = await db
            .select()
            .from(alertWebhookActions)
            .where(eq(alertWebhookActions.alertRuleId, alertRuleId));

        return response<GetAlertRuleResponse>(res, {
            data: {
                alertRuleId: rule.alertRuleId,
                orgId: rule.orgId,
                name: rule.name,
                eventType: rule.eventType,
                siteId: rule.siteId ?? null,
                healthCheckId: rule.healthCheckId ?? null,
                enabled: rule.enabled,
                cooldownSeconds: rule.cooldownSeconds,
                lastTriggeredAt: rule.lastTriggeredAt ?? null,
                createdAt: rule.createdAt,
                updatedAt: rule.updatedAt,
                recipients,
                webhookActions: webhooks.map((w) => ({
                    webhookActionId: w.webhookActionId,
                    webhookUrl: w.webhookUrl,
                    enabled: w.enabled,
                    lastSentAt: w.lastSentAt ?? null
                }))
            },
            success: true,
            error: false,
            message: "Alert rule retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}