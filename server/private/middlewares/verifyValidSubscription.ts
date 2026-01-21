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
import { TierId } from "@server/lib/billing/tiers";

export async function verifyValidLicense(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        if (build != "saas") {
            return next();
        }

        const { tier, active } = await getOrgTierData(orgId);
        const subscribed = tier === TierId.STANDARD;
        if (!subscribed) {
            return next(
                createHttpError(
                    HttpCode.FORBIDDEN,
                    "This organization's current plan does not support this feature."
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
