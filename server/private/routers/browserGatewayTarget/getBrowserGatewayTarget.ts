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
    browserGatewayTargetId: z
        .string()
        .transform(Number)
        .pipe(z.number().int().positive())
});

export type GetBrowserGatewayTargetResponse = BrowserGatewayTarget;

registry.registerPath({
    method: "get",
    path: "/org/{orgId}/browser-gateway-target/{browserGatewayTargetId}",
    description: "Get a browser gateway target.",
    tags: [OpenAPITags.Org],
    request: {
        params: paramsSchema
    },
    responses: {}
});

export async function getBrowserGatewayTarget(
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

        const { orgId, browserGatewayTargetId } = parsedParams.data;

        const [result] = await db
            .select({ bgt: browserGatewayTarget })
            .from(browserGatewayTarget)
            .innerJoin(sites, eq(sites.siteId, browserGatewayTarget.siteId))
            .where(
                and(
                    eq(
                        browserGatewayTarget.browserGatewayTargetId,
                        browserGatewayTargetId
                    ),
                    eq(sites.orgId, orgId)
                )
            )
            .limit(1);

        if (!result) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Browser gateway target with ID ${browserGatewayTargetId} not found`
                )
            );
        }

        return response<GetBrowserGatewayTargetResponse>(res, {
            data: result.bgt,
            success: true,
            error: false,
            message: "Browser gateway target retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Failed to retrieve browser gateway target"
            )
        );
    }
}
