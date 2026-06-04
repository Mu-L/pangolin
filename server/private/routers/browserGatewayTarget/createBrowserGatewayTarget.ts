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
import { encrypt } from "@server/lib/crypto";
import config from "@server/lib/config";
import { sendBrowserGatewayTargets } from "@server/routers/newt/targets";
import { generateId } from "@server/auth/sessions/app";

const paramsSchema = z.strictObject({
    orgId: z.string().nonempty(),
    resourceId: z.string().transform(Number).pipe(z.number().int().positive())
});

const bodySchema = z.strictObject({
    siteId: z.number().int().positive(),
    type: z.enum(["ssh", "rdp", "vnc"]),
    destination: z.string().nonempty(),
    destinationPort: z.number().int().min(1).max(65535)
});

export type CreateBrowserGatewayTargetResponse = BrowserGatewayTarget;

registry.registerPath({
    method: "put",
    path: "/org/{orgId}/resource/{resourceId}/browser-gateway-target",
    description: "Create a browser gateway target for a resource.",
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

export async function createBrowserGatewayTarget(
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

        const [site] = await db
            .select()
            .from(sites)
            .where(and(eq(sites.siteId, siteId), eq(sites.orgId, orgId)))
            .limit(1);

        if (!site) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Site with ID ${siteId} not found in organization ${orgId}`
                )
            );
        }

        const plainToken = generateId(48);
        const encryptedToken = encrypt(
            plainToken,
            config.getRawConfig().server.secret!
        );

        const [record] = await db
            .insert(browserGatewayTarget)
            .values({
                resourceId,
                siteId,
                type,
                destination,
                destinationPort,
                authToken: encryptedToken
            })
            .returning();

        if (site.type === "newt") {
            const [newt] = await db
                .select()
                .from(newts)
                .where(eq(newts.siteId, siteId))
                .limit(1);

            if (newt) {
                await sendBrowserGatewayTargets(
                    newt.newtId,
                    [record],
                    newt.version
                );
            }
        }

        logger.info(
            `Created browser gateway target ${record.browserGatewayTargetId} for resource ${resourceId}`
        );

        return response<CreateBrowserGatewayTargetResponse>(res, {
            data: record,
            success: true,
            error: false,
            message: "Browser gateway target created successfully",
            status: HttpCode.CREATED
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Failed to create browser gateway target"
            )
        );
    }
}
