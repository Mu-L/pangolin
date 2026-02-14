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
import {
    db,
    resourceHeaderAuth,
    resourceHeaderAuthExtendedCompatibility,
    resourcePolicies
} from "@server/db";
import {
    resources,
    userResources,
    roleResources,
    resourcePassword,
    resourcePincode,
    targets,
    targetHealthCheck
} from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import { sql, eq, or, inArray, and, count, ilike, asc } from "drizzle-orm";
import logger from "@server/logger";
import { fromZodError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";
import type { PaginatedResponse } from "@server/types/Pagination";
import type { ListResourcePoliciesResponse } from "@server/routers/resource/types";

const listResourcePoliciesParamsSchema = z.strictObject({
    orgId: z.string()
});

const listResourcePoliciesSchema = z.object({
    pageSize: z.coerce
        .number<string>() // for prettier formatting
        .int()
        .positive()
        .optional()
        .catch(20)
        .default(20),
    page: z.coerce
        .number<string>() // for prettier formatting
        .int()
        .min(0)
        .optional()
        .catch(1)
        .default(1),
    query: z.string().optional()
});

function queryResourcePoliciesBase() {
    return db
        .select({
            resourcePolicyId: resourcePolicies.resourcePolicyId,
            name: resourcePolicies.name,
            niceId: resourcePolicies.niceId,
            orgId: resourcePolicies.orgId
        })
        .from(resourcePolicies);
}

registry.registerPath({
    method: "get",
    path: "/org/{orgId}/resource-policies",
    description: "List resource policies for an organization.",
    tags: [OpenAPITags.Org, OpenAPITags.Resource],
    request: {
        params: z.object({
            orgId: z.string()
        }),
        query: listResourcePoliciesSchema
    },
    responses: {}
});

export async function listResourcePolicies(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedQuery = listResourcePoliciesSchema.safeParse(req.query);
        if (!parsedQuery.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromZodError(parsedQuery.error)
                )
            );
        }
        const { page, pageSize, query } = parsedQuery.data;

        const parsedParams = listResourcePoliciesParamsSchema.safeParse(
            req.params
        );
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromZodError(parsedParams.error)
                )
            );
        }

        const orgId =
            parsedParams.data.orgId ||
            req.userOrg?.orgId ||
            req.apiKeyOrg?.orgId;

        if (!orgId) {
            return next(
                createHttpError(HttpCode.BAD_REQUEST, "Invalid organization ID")
            );
        }

        if (req.user && orgId && orgId !== req.userOrgId) {
            return next(
                createHttpError(
                    HttpCode.FORBIDDEN,
                    "User does not have access to this organization"
                )
            );
        }

        let accessibleResourcePolicies: Array<{ resourcePolicyId: number }>;
        if (req.user) {
            accessibleResourcePolicies = await db
                .select({
                    resourcePolicyId: sql<number>`COALESCE(${userResources.resourcePolicyId}, ${roleResources.resourcePolicyId})`
                })
                .from(userResources)
                .fullJoin(
                    roleResources,
                    eq(
                        userResources.resourcePolicyId,
                        roleResources.resourcePolicyId
                    )
                )
                .where(
                    or(
                        eq(userResources.userId, req.user!.userId),
                        eq(roleResources.roleId, req.userOrgRoleId!)
                    )
                );
        } else {
            accessibleResourcePolicies = await db
                .select({
                    resourcePolicyId: resourcePolicies.resourcePolicyId
                })
                .from(resourcePolicies)
                .where(eq(resourcePolicies.orgId, orgId));
        }

        const accessibleResourceIds = accessibleResourcePolicies.map(
            (resource) => resource.resourcePolicyId
        );

        const conditions = [
            and(
                inArray(
                    resourcePolicies.resourcePolicyId,
                    accessibleResourceIds
                ),
                eq(resourcePolicies.orgId, orgId)
            )
        ];

        if (query) {
            conditions.push(
                or(
                    ilike(resourcePolicies.name, "%" + query + "%"),
                    ilike(resourcePolicies.niceId, "%" + query + "%")
                )
            );
        }

        const baseQuery = queryResourcePoliciesBase().where(and(...conditions));

        // we need to add `as` so that drizzle filters the result as a subquery
        const countQuery = db.$count(baseQuery.as("filtered_policies"));

        const [rows, totalCount] = await Promise.all([
            baseQuery
                .limit(pageSize)
                .offset(pageSize * (page - 1))
                .orderBy(asc(resourcePolicies.resourcePolicyId)),
            countQuery
        ]);

        return response<ListResourcePoliciesResponse>(res, {
            data: {
                policies: rows,
                pagination: {
                    total: totalCount,
                    pageSize,
                    page
                }
            },
            success: true,
            error: false,
            message: "Resources retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
