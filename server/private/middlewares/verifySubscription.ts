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
import createHttpError from "http-errors";
import HttpCode from "@server/types/HttpCode";
import { build } from "@server/build";
import { getOrgTierData } from "#private/lib/billing";

export async function verifyValidSubscription(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        if (build != "saas") {
            return next();
        }

        const orgId = req.params.orgId || req.body.orgId || req.query.orgId || req.userOrgId;

        if (!orgId) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "Organization ID is required to verify subscription"
                )
            );
        }

        const tier = await getOrgTierData(orgId);

        if (!tier.active) {
            return next(
                createHttpError(
                    HttpCode.FORBIDDEN,
                    "Organization does not have an active subscription"
                )
            );
        }

        return next();
    } catch (e) {
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Error verifying subscription"
            )
        );
    }
}
