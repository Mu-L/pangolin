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
import { db, orgs, siteResources } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";
import { eq, or } from "drizzle-orm";
import { canUserAccessSiteResource } from "@server/auth/canUserAccessSiteResource";
import { signPublicKey, getOrgCAKeys } from "#private/lib/sshCA";
import config from "@server/lib/config";

const paramsSchema = z.strictObject({
    orgId: z.string().nonempty()
});

const bodySchema = z
    .strictObject({
        publicKey: z.string().nonempty(),
        resourceId: z.number().int().positive().optional(),
        niceId: z.string().nonempty().optional(),
        alias: z.string().nonempty().optional()
    })
    .refine(
        (data) => {
            const fields = [data.resourceId, data.niceId, data.alias];
            const definedFields = fields.filter((field) => field !== undefined);
            return definedFields.length === 1;
        },
        {
            message:
                "Exactly one of resourceId, niceId, or alias must be provided"
        }
    );

export type SignSshKeyResponse = {
    certificate: string;
    sshUsername: string;
    sshHost: string;
    resourceId: number;
    keyId: string;
    validPrincipals: string[];
    validAfter: string;
    validBefore: string;
    expiresIn: number;
};

// registry.registerPath({
//     method: "post",
//     path: "/org/{orgId}/ssh/sign-key",
//     description: "Sign an SSH public key for access to a resource.",
//     tags: [OpenAPITags.Org, OpenAPITags.Ssh],
//     request: {
//         params: paramsSchema,
//         body: {
//             content: {
//                 "application/json": {
//                     schema: bodySchema
//                 }
//             }
//         }
//     },
//     responses: {}
// });

export async function signSshKey(
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

        const parsedBody = bodySchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { orgId } = parsedParams.data;
        const { publicKey, resourceId, niceId, alias } = parsedBody.data;
        const userId = req.user?.userId;
        const roleId = req.userOrgRoleId!;

        if (!userId) {
            return next(
                createHttpError(HttpCode.UNAUTHORIZED, "User not authenticated")
            );
        }

        // Get and decrypt the org's CA keys
        const caKeys = await getOrgCAKeys(
            orgId,
            config.getRawConfig().server.secret!
        );

        if (!caKeys) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    "SSH CA not configured for this organization"
                )
            );
        }

        // Verify the resource exists and belongs to the org
        // Build the where clause dynamically based on which field is provided
        let whereClause;
        if (resourceId !== undefined) {
            whereClause = eq(siteResources.siteResourceId, resourceId);
        } else if (niceId !== undefined) {
            whereClause = eq(siteResources.niceId, niceId);
        } else if (alias !== undefined) {
            whereClause = eq(siteResources.alias, alias);
        } else {
            // This should never happen due to the schema validation, but TypeScript doesn't know that
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "One of resourceId, niceId, or alias must be provided"
                )
            );
        }

        const [resource] = await db
            .select()
            .from(siteResources)
            .where(whereClause)
            .limit(1);

        if (!resource) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Resource not found`
                )
            );
        }

        if (resource.orgId !== orgId) {
            return next(
                createHttpError(
                    HttpCode.FORBIDDEN,
                    "Resource does not belong to the specified organization"
                )
            );
        }

        // Check if the user has access to the resource
        const hasAccess = await canUserAccessSiteResource({
            userId: userId,
            resourceId: resource.siteResourceId,
            roleId: roleId
        });

        if (!hasAccess) {
            return next(
                createHttpError(
                    HttpCode.FORBIDDEN,
                    "User does not have access to this resource"
                )
            );
        }

        let usernameToUse;
        if (req.user?.email) {
            // Extract username from email (first part before @)
            usernameToUse = req.user?.email.split("@")[0];
            if (!usernameToUse) {
                return next(
                    createHttpError(
                        HttpCode.BAD_REQUEST,
                        "Unable to extract username from email"
                    )
                );
            }
        } else if (req.user?.username) {
            usernameToUse = req.user.username;
            // We need to clean out any spaces or special characters from the username to ensure it's valid for SSH certificates
            usernameToUse = usernameToUse.replace(/[^a-zA-Z0-9_-]/g, "");
            if (!usernameToUse) {
                return next(
                    createHttpError(
                        HttpCode.BAD_REQUEST,
                        "Username is not valid for SSH certificate"
                    )
                );
            }
        } else {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "User does not have a valid email or username for SSH certificate"
                )
            );
        }

        // Sign the public key
        const now = BigInt(Math.floor(Date.now() / 1000));
        // only valid for 5 minutes
        const validFor = 300n;

        const cert = signPublicKey(caKeys.privateKeyPem, publicKey, {
            keyId: `${usernameToUse}@${orgId}`,
            validPrincipals: [usernameToUse, resource.niceId],
            validAfter: now - 60n, // Start 1 min ago for clock skew
            validBefore: now + validFor
        });

        const expiresIn = Number(validFor); // seconds

        return response<SignSshKeyResponse>(res, {
            data: {
                certificate: cert.certificate,
                sshUsername: usernameToUse,
                sshHost: resource.niceId,
                resourceId: resource.siteResourceId,
                keyId: cert.keyId,
                validPrincipals: cert.validPrincipals,
                validAfter: cert.validAfter.toISOString(),
                validBefore: cert.validBefore.toISOString(),
                expiresIn
            },
            success: true,
            error: false,
            message: "SSH key signed successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error("Error signing SSH key:", error);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "An error occurred while signing the SSH key"
            )
        );
    }
}
