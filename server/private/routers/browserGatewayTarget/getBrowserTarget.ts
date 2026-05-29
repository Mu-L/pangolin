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
import { browserGatewayTarget, db } from "@server/db";
import { resources, targets } from "@server/db";
import { eq } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import { fromError } from "zod-validation-error";
import logger from "@server/logger";
import { decrypt } from "@server/lib/crypto";
import config from "@server/lib/config";

const getBrowserTargetSchema = z
    .object({
        fullDomain: z.string().min(1, "fullDomain is required")
    })
    .strict();

export type GetBrowserTargetResponse = {
    ip: string;
    port: number;
    authToken: string;
    orgId: string;
    resourceId: number;
    niceId: string;
    pamMode: "passthrough" | "push" | null;
    authDaemonMode: "site" | "remote" | "native" | null;
};

export async function getBrowserTarget(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsed = getBrowserTargetSchema.safeParse(req.query);
        if (!parsed.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsed.error).toString()
                )
            );
        }

        const { fullDomain } = parsed.data;

        logger.info(`Retrieving browser target for domain: ${fullDomain}`);

        const [browserTarget] = await db
            .select({
                destination: browserGatewayTarget.destination,
                destinationPort: browserGatewayTarget.destinationPort,
                authToken: browserGatewayTarget.authToken,
                resourceId: resources.resourceId,
                niceId: resources.niceId,
                orgId: resources.orgId,
                pamMode: resources.pamMode,
                authDaemonMode: resources.authDaemonMode
            })
            .from(browserGatewayTarget)
            .innerJoin(
                resources,
                eq(browserGatewayTarget.resourceId, resources.resourceId)
            )
            .where(eq(resources.fullDomain, fullDomain))
            .limit(1);

        const decryptedAuthToken = decrypt(
            browserTarget.authToken,
            config.getRawConfig().server.secret!
        );

        if (!browserTarget) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    "No resource found for this domain"
                )
            );
        }

        return response<GetBrowserTargetResponse>(res, {
            data: {
                ip: browserTarget.destination,
                port: browserTarget.destinationPort,
                authToken: decryptedAuthToken,
                pamMode: browserTarget.pamMode,
                authDaemonMode: browserTarget.authDaemonMode,
                orgId: browserTarget.orgId,
                resourceId: browserTarget.resourceId,
                niceId: browserTarget.niceId
            },
            success: true,
            error: false,
            message: "Browser target retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "An error occurred while retrieving the browser target"
            )
        );
    }
}
