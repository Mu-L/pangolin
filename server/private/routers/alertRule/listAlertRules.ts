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
import { and, asc, desc, eq, inArray, like, sql } from "drizzle-orm";

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
        .pipe(z.number().int().nonnegative()),
    query: z.string().optional(),
    siteId: z
        .string()
        .optional()
        .transform((v) => (v !== undefined ? Number(v) : undefined))
        .pipe(z.number().int().positive().optional()),
    resourceId: z
        .string()
        .optional()
        .transform((v) => (v !== undefined ? Number(v) : undefined))
        .pipe(z.number().int().positive().optional()),
    sort_by: z.enum(["name", "last_triggered_at"]).optional(),
    order: z.enum(["asc", "desc"]).optional().default("asc"),
    enabled: z.enum(["true", "false"]).optional()
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
        const {
            limit,
            offset,
            query,
            siteId,
            resourceId,
            sort_by,
            order,
            enabled: enabledFilter
        } = parsedQuery.data;

        // Resolve siteId filter → matching alertRuleIds
        let siteFilterRuleIds: number[] | null = null;
        if (siteId !== undefined) {
            const rows = await db
                .select({ alertRuleId: alertSites.alertRuleId })
                .from(alertSites)
                .where(eq(alertSites.siteId, siteId));
            siteFilterRuleIds = rows.map((r) => r.alertRuleId);
            if (siteFilterRuleIds.length === 0) {
                return response<ListAlertRulesResponse>(res, {
                    data: {
                        alertRules: [],
                        pagination: { total: 0, limit, offset }
                    },
                    success: true,
                    error: false,
                    message: "Alert rules retrieved successfully",
                    status: HttpCode.OK
                });
            }
        }

        // Resolve resourceId filter → matching alertRuleIds
        let resourceFilterRuleIds: number[] | null = null;
        if (resourceId !== undefined) {
            const rows = await db
                .select({ alertRuleId: alertResources.alertRuleId })
                .from(alertResources)
                .where(eq(alertResources.resourceId, resourceId));
            resourceFilterRuleIds = rows.map((r) => r.alertRuleId);
            if (resourceFilterRuleIds.length === 0) {
                return response<ListAlertRulesResponse>(res, {
                    data: {
                        alertRules: [],
                        pagination: { total: 0, limit, offset }
                    },
                    success: true,
                    error: false,
                    message: "Alert rules retrieved successfully",
                    status: HttpCode.OK
                });
            }
        }

        const whereClause = and(
            eq(alertRules.orgId, orgId),
            query
                ? like(sql`LOWER(${alertRules.name})`, `%${query.toLowerCase()}%`)
                : undefined,
            siteFilterRuleIds !== null
                ? inArray(alertRules.alertRuleId, siteFilterRuleIds)
                : undefined,
            resourceFilterRuleIds !== null
                ? inArray(alertRules.alertRuleId, resourceFilterRuleIds)
                : undefined,
            enabledFilter !== undefined
                ? eq(alertRules.enabled, enabledFilter === "true")
                : undefined
        );

        const orderByClause =
            sort_by === "name"
                ? order === "asc"
                    ? asc(alertRules.name)
                    : desc(alertRules.name)
                : sort_by === "last_triggered_at"
                  ? order === "asc"
                      ? sql`${alertRules.lastTriggeredAt} ASC NULLS FIRST`
                      : sql`${alertRules.lastTriggeredAt} DESC NULLS LAST`
                  : sql`${alertRules.createdAt} DESC`;

        const list = await db
            .select()
            .from(alertRules)
            .where(whereClause)
            .orderBy(orderByClause)
            .limit(limit)
            .offset(offset);

        const [{ count }] = await db
            .select({ count: sql<number>`count(*)` })
            .from(alertRules)
            .where(whereClause);

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