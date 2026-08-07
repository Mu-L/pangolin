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
import { ListAlertRulesResponse } from "@server/routers/alertRule/types";

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
    webhookUrl: z.string().url(),
    config: z.string().optional(),
    enabled: z.boolean().optional().default(true)
});

const bodySchema = z.strictObject({
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

        // TODO: process alert rule
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
