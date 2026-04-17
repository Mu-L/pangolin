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
import { db, idpOrg } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { and, eq, sql } from "drizzle-orm";
import { OpenAPITags, registry } from "@server/openApi";
import privateConfig from "#private/lib/config";

const paramsSchema = z
    .object({
        orgId: z.string().nonempty(),
        idpId: z.coerce.number<number>().int().positive()
    })
    .strict();

export async function unassociateOrgIdp(
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

        const { orgId, idpId } = parsedParams.data;

        if (
            privateConfig.getRawPrivateConfig().app.identity_provider_mode !==
            "org"
        ) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "Organization-specific IdP creation is not allowed in the current identity provider mode. Set app.identity_provider_mode to 'org' in the private configuration to enable this feature."
                )
            );
        }

        const [association] = await db
            .select()
            .from(idpOrg)
            .where(and(eq(idpOrg.idpId, idpId), eq(idpOrg.orgId, orgId)))
            .limit(1);

        if (!association) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `IdP with ID ${idpId} is not associated with organization ${orgId}`
                )
            );
        }

        const [{ count }] = await db
            .select({ count: sql<number>`count(*)` })
            .from(idpOrg)
            .where(eq(idpOrg.idpId, idpId));

        if (count <= 1) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "This is the last organization associated with this identity provider. Delete it instead."
                )
            );
        }

        await db
            .delete(idpOrg)
            .where(and(eq(idpOrg.idpId, idpId), eq(idpOrg.orgId, orgId)));

        return response<null>(res, {
            data: null,
            success: true,
            error: false,
            message: "Org IdP unassociated successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
