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
import { z } from "zod";
import { customers, db } from "@server/db";
import { eq } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import config from "@server/lib/config";
import { fromError } from "zod-validation-error";
import stripe from "#private/lib/stripe";
import { getLicensePriceSet, LicenseId } from "@server/lib/billing/licenses";

const createCheckoutSessionParamsSchema = z.strictObject({
    orgId: z.string(),
});

const createCheckoutSessionBodySchema = z.strictObject({
    tier: z.enum([LicenseId.BIG_LICENSE, LicenseId.SMALL_LICENSE]),
});

export async function createCheckoutSessionoLicense(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = createCheckoutSessionParamsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { orgId } = parsedParams.data;

        const parsedBody = createCheckoutSessionBodySchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { tier } = parsedBody.data;

        // check if we already have a customer for this org
        const [customer] = await db
            .select()
            .from(customers)
            .where(eq(customers.orgId, orgId))
            .limit(1);

        // If we don't have a customer, create one
        if (!customer) {
            // error
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "No customer found for this organization"
                )
            );
        }

        const tierPrice = getLicensePriceSet()[tier]

        const session = await stripe!.checkout.sessions.create({
            client_reference_id: orgId, // So we can look it up the org later on the webhook
            billing_address_collection: "required",
            line_items: [
                {
                    price: tierPrice, // Use the standard tier
                    quantity: 1
                },
            ], // Start with the standard feature set that matches the free limits
            customer: customer.customerId,
            mode: "subscription",
            success_url: `${config.getRawConfig().app.dashboard_url}/${orgId}/settings/license?success=true&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${config.getRawConfig().app.dashboard_url}/${orgId}/settings/license?canceled=true`
        });

        return response<string>(res, {
            data: session.url,
            success: true,
            error: false,
            message: "Checkout session created successfully",
            status: HttpCode.CREATED
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
