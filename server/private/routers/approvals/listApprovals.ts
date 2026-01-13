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

import logger from "@server/logger";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import { z } from "zod";
import { fromError } from "zod-validation-error";

import type { Request, Response, NextFunction } from "express";
import { build } from "@server/build";
import { getOrgTierData } from "@server/lib/billing";
import { TierId } from "@server/lib/billing/tiers";
import { approvals, clients, db, users } from "@server/db";
import { eq, isNull, sql, not, and, desc } from "drizzle-orm";
import response from "@server/lib/response";

const paramsSchema = z.strictObject({
    orgId: z.string()
});

const querySchema = z.strictObject({
    limit: z
        .string()
        .optional()
        .default("1000")
        .transform(Number)
        .pipe(z.int().nonnegative()),
    offset: z
        .string()
        .optional()
        .default("0")
        .transform(Number)
        .pipe(z.int().nonnegative())
});

async function queryApprovals(orgId: string, limit: number, offset: number) {
    const res = await db
        .select({
            approvalId: approvals.id,
            orgId: approvals.orgId,
            clientId: approvals.clientId,
            decision: approvals.decision,
            type: approvals.type,
            user: {
                name: users.name,
                userId: users.userId,
                username: users.username
            }
        })
        .from(approvals)
        .innerJoin(users, and(eq(approvals.userId, users.userId)))
        .leftJoin(
            clients,
            and(
                eq(approvals.clientId, clients.clientId),
                not(isNull(clients.userId)) // only user devices
            )
        )
        .where(eq(approvals.orgId, orgId))
        .orderBy(
            sql`CASE ${approvals.decision} WHEN 'pending' THEN 0 ELSE 1 END`,
            desc(approvals.timestamp)
        )
        .limit(limit)
        .offset(offset);
    return res;
}

export type ListApprovalsResponse = {
    approvals: NonNullable<Awaited<ReturnType<typeof queryApprovals>>>;
    pagination: { total: number; limit: number; offset: number };
};

export async function listApprovals(
    req: Request,
    res: Response,
    next: NextFunction
) {
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

        const { orgId } = parsedParams.data;

        if (build === "saas") {
            const { tier } = await getOrgTierData(orgId);
            const subscribed = tier === TierId.STANDARD;
            if (!subscribed) {
                return next(
                    createHttpError(
                        HttpCode.FORBIDDEN,
                        "This organization's current plan does not support this feature."
                    )
                );
            }
        }

        const approvalsList = await queryApprovals(
            orgId.toString(),
            limit,
            offset
        );

        const [{ count }] = await db
            .select({ count: sql<number>`count(*)` })
            .from(approvals);

        return response<ListApprovalsResponse>(res, {
            data: {
                approvals: approvalsList,
                pagination: {
                    total: count,
                    limit,
                    offset
                }
            },
            success: true,
            error: false,
            message: "Approvals retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
