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
import {
    browserGatewayTarget,
    BrowserGatewayTarget,
    db,
    resources,
    sites
} from "@server/db";
import { eq, and } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";

const paramsSchema = z.strictObject({
    orgId: z.string().nonempty(),
    resourceId: z.string().transform(Number).pipe(z.number().int().positive())
});

const querySchema = z.object({
    limit: z
        .string()
        .optional()
        .default("1000")
        .transform(Number)
        .pipe(z.number().int().positive()),
    offset: z
        .string()
        .optional()
        .default("0")
        .transform(Number)
        .pipe(z.number().int().nonnegative())
});

export type ListBrowserGatewayTargetsResponse = {
    targets: BrowserGatewayTarget[];
    total: number;
    limit: number;
    offset: number;
};

registry.registerPath({
    method: "get",
    path: "/org/{orgId}/resource/{resourceId}/browser-gateway-targets",
    description: "List browser gateway targets for a resource.",
    tags: [OpenAPITags.Org],
    request: {
        params: paramsSchema,
        query: querySchema
    },
    responses: {}
});

export async function listBrowserGatewayTargets(
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

        const { orgId, resourceId } = parsedParams.data;

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

        const [resource] = await db
            .select()
            .from(resources)
            .where(
                and(
                    eq(resources.resourceId, resourceId),
                    eq(resources.orgId, orgId)
                )
            )
            .limit(1);

        if (!resource) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Resource with ID ${resourceId} not found in organization ${orgId}`
                )
            );
        }

        const rows = await db
            .select({
                browserGatewayTargetId:
                    browserGatewayTarget.browserGatewayTargetId,
                resourceId: browserGatewayTarget.resourceId,
                siteId: browserGatewayTarget.siteId,
                authToken: browserGatewayTarget.authToken,
                type: browserGatewayTarget.type,
                destination: browserGatewayTarget.destination,
                destinationPort: browserGatewayTarget.destinationPort,
                siteName: sites.name
            })
            .from(browserGatewayTarget)
            .leftJoin(sites, eq(sites.siteId, browserGatewayTarget.siteId))
            .where(eq(browserGatewayTarget.resourceId, resourceId))
            .limit(limit)
            .offset(offset);

        return response<ListBrowserGatewayTargetsResponse>(res, {
            data: {
                targets: rows as any,
                total: rows.length,
                limit,
                offset
            },
            success: true,
            error: false,
            message: "Browser gateway targets retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Failed to list browser gateway targets"
            )
        );
    }
}
