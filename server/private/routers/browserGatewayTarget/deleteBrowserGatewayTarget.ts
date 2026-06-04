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
import { browserGatewayTarget, db, newts, sites } from "@server/db";
import { eq, and } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";
import { removeBrowserGatewayTarget } from "@server/routers/newt/targets";

const paramsSchema = z.strictObject({
    orgId: z.string().nonempty(),
    browserGatewayTargetId: z
        .string()
        .transform(Number)
        .pipe(z.number().int().positive())
});

registry.registerPath({
    method: "delete",
    path: "/org/{orgId}/browser-gateway-target/{browserGatewayTargetId}",
    description: "Delete a browser gateway target.",
    tags: [OpenAPITags.Org],
    request: {
        params: paramsSchema
    },
    responses: {}
});

export async function deleteBrowserGatewayTarget(
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

        const [existing] = await db
            .select({ bgt: browserGatewayTarget, site: sites })
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

        if (!existing) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Browser gateway target with ID ${browserGatewayTargetId} not found`
                )
            );
        }

        await db
            .delete(browserGatewayTarget)
            .where(
                eq(
                    browserGatewayTarget.browserGatewayTargetId,
                    browserGatewayTargetId
                )
            );

        if (existing.site.type === "newt") {
            const [newt] = await db
                .select()
                .from(newts)
                .where(eq(newts.siteId, existing.bgt.siteId))
                .limit(1);

            if (newt) {
                await removeBrowserGatewayTarget(
                    newt.newtId,
                    browserGatewayTargetId,
                    newt.version
                );
            }
        }

        logger.info(`Deleted browser gateway target ${browserGatewayTargetId}`);

        return response(res, {
            data: null,
            success: true,
            error: false,
            message: "Browser gateway target deleted successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Failed to delete browser gateway target"
            )
        );
    }
}
