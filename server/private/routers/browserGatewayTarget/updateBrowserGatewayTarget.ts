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
    newts,
    sites
} from "@server/db";
import { eq, and } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";
import { sendBrowserGatewayTargets } from "@server/routers/newt/targets";

const paramsSchema = z.strictObject({
    orgId: z.string().nonempty(),
    browserGatewayTargetId: z
        .string()
        .transform(Number)
        .pipe(z.number().int().positive())
});

const bodySchema = z.strictObject({
    siteId: z.number().int().positive().optional(),
    type: z.enum(["ssh", "rdp", "vnc"]).optional(),
    destination: z.string().nonempty().optional(),
    destinationPort: z.number().int().min(1).max(65535).optional()
});

export type UpdateBrowserGatewayTargetResponse = BrowserGatewayTarget;

registry.registerPath({
    method: "post",
    path: "/org/{orgId}/browser-gateway-target/{browserGatewayTargetId}",
    description: "Update a browser gateway target.",
    tags: [OpenAPITags.Org],
    request: {
        params: paramsSchema,
        body: {
            content: {
                "application/json": {
                    schema: bodySchema
                }
            }
        }
    },
    responses: {}
});

export async function updateBrowserGatewayTarget(
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

        const parsedBody = bodySchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { siteId, type, destination, destinationPort } = parsedBody.data;

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

        const updateValues: Partial<BrowserGatewayTarget> = {};
        if (siteId !== undefined) updateValues.siteId = siteId;
        if (type !== undefined) updateValues.type = type;
        if (destination !== undefined) updateValues.destination = destination;
        if (destinationPort !== undefined)
            updateValues.destinationPort = destinationPort;

        const [updated] = await db
            .update(browserGatewayTarget)
            .set(updateValues)
            .where(
                eq(
                    browserGatewayTarget.browserGatewayTargetId,
                    browserGatewayTargetId
                )
            )
            .returning();

        const targetSiteId = siteId ?? existing.bgt.siteId;
        const [site] = await db
            .select()
            .from(sites)
            .where(eq(sites.siteId, targetSiteId))
            .limit(1);

        if (site && site.type === "newt") {
            const [newt] = await db
                .select()
                .from(newts)
                .where(eq(newts.siteId, targetSiteId))
                .limit(1);

            if (newt) {
                await sendBrowserGatewayTargets(
                    newt.newtId,
                    [updated],
                    newt.version
                );
            }
        }

        logger.info(`Updated browser gateway target ${browserGatewayTargetId}`);

        return response<UpdateBrowserGatewayTargetResponse>(res, {
            data: updated,
            success: true,
            error: false,
            message: "Browser gateway target updated successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Failed to update browser gateway target"
            )
        );
    }
}
