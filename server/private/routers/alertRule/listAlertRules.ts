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
import { alertRules, alertSites, alertHealthChecks, alertResources } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";
import { eq, inArray, sql } from "drizzle-orm";

const paramsSchema = z.strictObject({
    orgId: z.string().nonempty()
});

const querySchema = z.strictObject({
    limit: z
        .string()
        .optional()
        .default("1000")
        .transform(Number)
        .pipe(z.number().int().nonnegative()),
    offset: z
        .string()
        .optional()
        .default("0")
        .transform(Number)
        .pipe(z.number().int().nonnegative())
});

export type ListAlertRulesResponse = {
    alertRules: {
        alertRuleId: number;
        orgId: string;
        name: string;
        eventType: string;
        enabled: boolean;
        cooldownSeconds: number;
        lastTriggeredAt: number | null;
        createdAt: number;
        updatedAt: number;
        siteIds: number[];
        healthCheckIds: number[];
        resourceIds: number[];
    }[];
    pagination: {
        total: number;
        limit: number;
        offset: number;
    };
};

registry.registerPath({
    method: "get",
    path: "/org/{orgId}/alert-rules",
    description: "List all alert rules for a specific organization.",
    tags: [OpenAPITags.Org],
    request: {
        query: querySchema,
        params: paramsSchema
    },
    responses: {}
});

export async function listAlertRules(
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

        const parsedQuery = querySchema.safeParse(req.query);
        if (!parsedQuery.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedQuery.error).toString()
                )
            );
        }
        const { limit, offset } = parsedQuery.data;

        const list = await db
            .select()
            .from(alertRules)
            .where(eq(alertRules.orgId, orgId))
            .orderBy(sql`${alertRules.createdAt} DESC`)
            .limit(limit)
            .offset(offset);

        const [{ count }] = await db
            .select({ count: sql<number>`count(*)` })
            .from(alertRules)
            .where(eq(alertRules.orgId, orgId));

        // Batch-fetch site and health-check associations for all returned rules
        // in two queries rather than N+1 individual lookups.
        const ruleIds = list.map((r) => r.alertRuleId);

        const siteRows =
            ruleIds.length > 0
                ? await db
                      .select()
                      .from(alertSites)
                      .where(inArray(alertSites.alertRuleId, ruleIds))
                : [];

        const healthCheckRows =
            ruleIds.length > 0
                ? await db
                      .select()
                      .from(alertHealthChecks)
                      .where(
                          inArray(alertHealthChecks.alertRuleId, ruleIds)
                      )
                : [];

        const resourceRows =
            ruleIds.length > 0
                ? await db
                      .select()
                      .from(alertResources)
                      .where(inArray(alertResources.alertRuleId, ruleIds))
                : [];

        // Index by alertRuleId for O(1) lookup when building the response
        const sitesByRule = new Map<number, number[]>();
        for (const row of siteRows) {
            const existing = sitesByRule.get(row.alertRuleId) ?? [];
            existing.push(row.siteId);
            sitesByRule.set(row.alertRuleId, existing);
        }

        const healthChecksByRule = new Map<number, number[]>();
        for (const row of healthCheckRows) {
            const existing = healthChecksByRule.get(row.alertRuleId) ?? [];
            existing.push(row.healthCheckId);
            healthChecksByRule.set(row.alertRuleId, existing);
        }

        const resourcesByRule = new Map<number, number[]>();
        for (const row of resourceRows) {
            const existing = resourcesByRule.get(row.alertRuleId) ?? [];
            existing.push(row.resourceId);
            resourcesByRule.set(row.alertRuleId, existing);
        }

        return response<ListAlertRulesResponse>(res, {
            data: {
                alertRules: list.map((rule) => ({
                    alertRuleId: rule.alertRuleId,
                    orgId: rule.orgId,
                    name: rule.name,
                    eventType: rule.eventType,
                    enabled: rule.enabled,
                    cooldownSeconds: rule.cooldownSeconds,
                    lastTriggeredAt: rule.lastTriggeredAt ?? null,
                    createdAt: rule.createdAt,
                    updatedAt: rule.updatedAt,
                    siteIds: sitesByRule.get(rule.alertRuleId) ?? [],
                    healthCheckIds:
                        healthChecksByRule.get(rule.alertRuleId) ?? [],
                    resourceIds: resourcesByRule.get(rule.alertRuleId) ?? []
                })),
                pagination: {
                    total: count,
                    limit,
                    offset
                }
            },
            success: true,
            error: false,
            message: "Alert rules retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}