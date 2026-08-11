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
    alertResources
} from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";
import { and, asc, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import {
    ListAlertRulesResponse,
    type AlertAction,
    type EmailAlertAction
} from "@server/routers/alertRule/types";
import { processTestAlerts } from "@server/private/lib/alerts/processTestAlerts";
import { getRandomItemInArray } from "@app/lib/getRandomItemInArray";

const paramsSchema = z.strictObject({
    orgId: z.string().nonempty()
});

export const SITE_EVENT_TYPES = [
    "site_online",
    "site_offline",
    "site_toggle"
] as const;
export const HC_EVENT_TYPES = [
    "health_check_healthy",
    "health_check_unhealthy",
    "health_check_toggle"
] as const;
export const RESOURCE_EVENT_TYPES = [
    "resource_healthy",
    "resource_unhealthy",
    "resource_degraded",
    "resource_toggle"
] as const;

const webhookActionSchema = z.strictObject({
    webhookUrl: z.url(),
    config: z.string().optional(),
    enabled: z.boolean().optional().default(true)
});

const bodySchema = z.object({
    eventType: z.enum([
        ...HC_EVENT_TYPES,
        ...SITE_EVENT_TYPES,
        ...RESOURCE_EVENT_TYPES
    ]),
    // Email recipients (flat)
    userIds: z.array(z.string().nonempty()).optional().default([]),
    roleIds: z.array(z.number()).optional().default([]),
    emails: z.array(z.email()).optional().default([]),
    // Webhook actions
    webhookActions: z.array(webhookActionSchema).optional().default([])
});

export async function testAlertRule(
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

        const body = parsedBody.data;
        const collectedActions: AlertAction[] = [];
        if (
            body.emails.length > 0 ||
            body.roleIds.length > 0 ||
            body.userIds.length > 0
        ) {
            collectedActions.push({
                type: "email",
                emails: body.emails,
                roleIds: body.roleIds,
                userIds: body.userIds
            });
        }

        for (const action of body.webhookActions) {
            collectedActions.push({
                type: "webhook",
                ...action
            });
        }

        let data: Record<string, any> = {};
        switch (body.eventType) {
            case "site_toggle":
                data = {
                    status: getRandomItemInArray(["online", "offline"]),
                    siteName: "Test Site Alert"
                };
                break;
            case "site_offline":
                data = {
                    status: "offline",
                    siteName: "Test Site Alert"
                };
                break;
            case "site_online":
                data = {
                    status: "online",
                    siteName: "Test Site Alert"
                };
                break;
            case "resource_toggle":
                data = {
                    status: getRandomItemInArray([
                        "healthy",
                        "unhealthy",
                        "degraded"
                    ]),
                    siteName: "Test Resource Alert"
                };
                break;
            case "resource_healthy":
                data = {
                    status: "healthy",
                    siteName: "Test Resource Alert"
                };
                break;
            case "resource_unhealthy":
                data = {
                    status: "unhealthy",
                    siteName: "Test Resource Alert"
                };
                break;
            case "resource_degraded":
                data = {
                    status: "degraded",
                    siteName: "Test Resource Alert"
                };
                break;
            case "health_check_toggle":
                data = {
                    status: getRandomItemInArray(["healthy", "unhealthy"]),
                    healthCheckName: "Test Health Check Alert"
                };
                break;
            case "health_check_healthy":
                data = {
                    status: "healthy",
                    healthCheckName: "Test Health Check Alert"
                };
                break;
            case "health_check_unhealthy":
                data = {
                    status: "unhealthy",
                    healthCheckName: "Test Health Check Alert"
                };
                break;

            default:
                break;
        }

        // TODO: process alert rule
        await processTestAlerts({
            eventType: body.eventType,
            orgId,
            actions: collectedActions,
            data
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
