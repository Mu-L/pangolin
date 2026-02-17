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
import { db, newts, orgs, roundTripMessageTracker, siteResources, sites, userOrgs } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";
import { eq, or, and } from "drizzle-orm";
import { canUserAccessSiteResource } from "@server/auth/canUserAccessSiteResource";
import { signPublicKey, getOrgCAKeys } from "#private/lib/sshCA";
import config from "@server/lib/config";
import { sendToClient } from "#private/routers/ws";

const paramsSchema = z.strictObject({
    orgId: z.string().nonempty()
});

const bodySchema = z
    .strictObject({
        publicKey: z.string().nonempty(),
        resourceId: z.number().int().positive().optional(),
        resource: z.string().nonempty().optional() // this is either the nice id or the alias
    })
    .refine(
        (data) => {
            const fields = [data.resourceId, data.resource];
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
    messageId: number;
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
        const {
            publicKey,
            resourceId,
            resource: resourceQueryString
        } = parsedBody.data;
        const userId = req.user?.userId;
        const roleId = req.userOrgRoleId!;

        if (!userId) {
            return next(
                createHttpError(HttpCode.UNAUTHORIZED, "User not authenticated")
            );
        }

        const [userOrg] = await db
            .select()
            .from(userOrgs)
            .where(and(eq(userOrgs.orgId, orgId), eq(userOrgs.userId, userId)))
            .limit(1);

        if (!userOrg) {
            return next(
                createHttpError(
                    HttpCode.FORBIDDEN,
                    "User does not belong to the specified organization"
                )
            );
        }

        let usernameToUse;
        if (!userOrg.pamUsername) {
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

            // check if we have a existing user in this org with the same
            const [existingUserWithSameName] = await db
                .select()
                .from(userOrgs)
                .where(
                    and(
                        eq(userOrgs.orgId, orgId),
                        eq(userOrgs.pamUsername, usernameToUse)
                    )
                )
                .limit(1);

            if (existingUserWithSameName) {
                let foundUniqueUsername = false;
                for (let attempt = 0; attempt < 20; attempt++) {
                    const randomNum = Math.floor(Math.random() * 101); // 0 to 100
                    const candidateUsername = `${usernameToUse}${randomNum}`;

                    const [existingUser] = await db
                        .select()
                        .from(userOrgs)
                        .where(
                            and(
                                eq(userOrgs.orgId, orgId),
                                eq(userOrgs.pamUsername, candidateUsername)
                            )
                        )
                        .limit(1);

                    if (!existingUser) {
                        usernameToUse = candidateUsername;
                        foundUniqueUsername = true;
                        break;
                    }
                }

                if (!foundUniqueUsername) {
                    return next(
                        createHttpError(
                            HttpCode.CONFLICT,
                            "Unable to generate a unique username for SSH certificate"
                        )
                    );
                }
            }
        } else {
            usernameToUse = userOrg.pamUsername;
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
        } else if (resourceQueryString !== undefined) {
            whereClause = or(
                eq(siteResources.niceId, resourceQueryString),
                eq(siteResources.alias, resourceQueryString)
            );
        } else {
            // This should never happen due to the schema validation, but TypeScript doesn't know that
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "One of resourceId, niceId, or alias must be provided"
                )
            );
        }

        const resources = await db
            .select()
            .from(siteResources)
            .where(and(whereClause, eq(siteResources.orgId, orgId)));

        if (!resources || resources.length === 0) {
            return next(
                createHttpError(HttpCode.NOT_FOUND, `Resource not found`)
            );
        }

        if (resources.length > 1) {
            // error but this should not happen because the nice id cant contain a dot and the alias has to have a dot and both have to be unique within the org so there should never be multiple matches
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    `Multiple resources found matching the criteria`
                )
            );
        }

        const resource = resources[0];

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

        // get the site
        const [newt] = await db
            .select()
            .from(newts)
            .where(eq(newts.siteId, resource.siteId))
            .limit(1);

        if (!newt) {
            return next(
                createHttpError(
                    HttpCode.INTERNAL_SERVER_ERROR,
                    "Site associated with resource not found"
                )
            );
        }

        // Sign the public key
        const now = BigInt(Math.floor(Date.now() / 1000));
        // only valid for 5 minutes
        const validFor = 300n;

        const cert = signPublicKey(caKeys.privateKeyPem, publicKey, {
            keyId: `${usernameToUse}@${resource.niceId}`,
            validPrincipals: [usernameToUse, resource.niceId],
            validAfter: now - 60n, // Start 1 min ago for clock skew
            validBefore: now + validFor
        });

        const [message] = await db
            .insert(roundTripMessageTracker)
            .values({
                wsClientId: newt.newtId,
                messageType: `newt/pam/connection`,
                sentAt: Math.floor(Date.now() / 1000),
            })
            .returning();

        if (!message) {
            return next(
                createHttpError(
                    HttpCode.INTERNAL_SERVER_ERROR,
                    "Failed to create message tracker entry"
                )
            );
        }

        await sendToClient(newt.newtId, {
            type: `newt/pam/connection`,
            data: {
                messageId: message.messageId,
                orgId: orgId,
                agentPort: 22123,
                agentHost: resource.destination,
                caCert: caKeys.publicKeyOpenSSH,
                username: usernameToUse,
                niceId: resource.niceId,
                metadata: {
                    sudo: true, // we are hardcoding these for now but should make configurable from the role or something
                    homedir: true
                }
            }
        });

        const expiresIn = Number(validFor); // seconds

        let sshHost;
        if (resource.alias && resource.alias != "") {
            sshHost = resource.alias;
        } else {
            sshHost = resource.destination;
        }

        return response<SignSshKeyResponse>(res, {
            data: {
                certificate: cert.certificate,
                messageId: message.messageId,
                sshUsername: usernameToUse,
                sshHost: sshHost,
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
