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

import {
    db,
    labels,
    resourceLabels,
    resources,
    siteLabels,
    sites
} from "@server/db";
import response from "@server/lib/response";
import logger from "@server/logger";
import HttpCode from "@server/types/HttpCode";
import { and, eq } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";
import createHttpError from "http-errors";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const paramsSchema = z.strictObject({
    orgId: z.string().nonempty(),
    labelId: z.string().transform(Number).pipe(z.int().positive())
});

const detachLabelBodySchema = z.strictObject({
    siteId: z.number().int().optional(),
    resourceId: z.number().int().optional()
});

export async function detachLabelFromItem(
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

        const { orgId, labelId } = parsedParams.data;

        const parsedBody = detachLabelBodySchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { siteId, resourceId } = parsedBody.data;

        if (!siteId && !resourceId) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "At least one of `siteId` or `resourceId` should be provided."
                )
            );
        }

        const [existing] = await db
            .select()
            .from(labels)
            .where(and(eq(labels.labelId, labelId), eq(labels.orgId, orgId)));

        if (!existing) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Label with Id ${labelId} not found`
                )
            );
        }

        if (siteId) {
            const siteCount = await db.$count(
                sites,
                and(eq(sites.siteId, siteId), eq(sites.orgId, orgId))
            );

            if (siteCount === 0) {
                return next(
                    createHttpError(
                        HttpCode.NOT_FOUND,
                        `Site with Id ${siteId} doesn't exist.`
                    )
                );
            }

            await db
                .delete(siteLabels)
                .where(
                    and(
                        eq(siteLabels.labelId, labelId),
                        eq(siteLabels.siteId, siteId)
                    )
                );
        }

        if (resourceId) {
            const resourceCount = await db.$count(
                resources,
                and(
                    eq(resources.resourceId, resourceId),
                    eq(resources.orgId, orgId)
                )
            );

            if (resourceCount === 0) {
                return next(
                    createHttpError(
                        HttpCode.NOT_FOUND,
                        `Resource with Id ${resourceId} doesn't exist.`
                    )
                );
            }

            await db
                .delete(resourceLabels)
                .where(
                    and(
                        eq(resourceLabels.labelId, labelId),
                        eq(resourceLabels.resourceId, resourceId)
                    )
                );
        }

        return response(res, {
            data: {},
            success: true,
            error: false,
            message: "Label detached successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
