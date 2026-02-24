import { Request, Response, NextFunction } from "express";
import z from "zod";
import { OpenAPITags, registry } from "@server/openApi";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import { fromError } from "zod-validation-error";
import {
    db,
    orgs,
    resourcePolicies,
    rolePolicies,
    roles,
    userPolicies,
    type ResourcePolicy
} from "@server/db";
import { and, eq } from "drizzle-orm";
import logger from "@server/logger";
import { getUniqueResourcePolicyName } from "@server/db/names";
import response from "@server/lib/response";

const createResourcePolicyParamsSchema = z.strictObject({
    orgId: z.string()
});

const createResourcePolicyBodySchema = z.strictObject({
    name: z.string().min(1).max(255),
    sso: z.boolean(),
    skipToIdpId: z.string().optional(),
    roleIds: z.array(z.string()).optional().default([]),
    userIds: z.array(z.string()).optional().default([])
});

registry.registerPath({
    method: "post",
    path: "/org/{orgId}/resource-policy",
    description: "Create a resource.",
    tags: [OpenAPITags.Org, OpenAPITags.Resource],
    request: {
        params: createResourcePolicyParamsSchema,
        body: {
            content: {
                "application/json": {
                    schema: createResourcePolicyParamsSchema
                }
            }
        }
    },
    responses: {}
});

export async function createResourcePolicy(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        // Validate request params
        const parsedParams = createResourcePolicyParamsSchema.safeParse(
            req.params
        );
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }
        const { orgId } = parsedParams.data;

        if (req.user && !req.userOrgRoleId) {
            return next(
                createHttpError(HttpCode.FORBIDDEN, "User does not have a role")
            );
        }

        // get the org
        const org = await db
            .select()
            .from(orgs)
            .where(eq(orgs.orgId, orgId))
            .limit(1);

        if (org.length === 0) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Organization with ID ${orgId} not found`
                )
            );
        }

        const parsedBody = createResourcePolicyBodySchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { name, sso, userIds, roleIds, skipToIdpId } = parsedBody.data;

        const isAuthEnabeld = sso; // other conditions will follow

        if (!isAuthEnabeld) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "At least one authentication policy must be set: platform SSO, an authentication method, one-time password, or a rule."
                )
            );
        }

        const adminRole = await db
            .select()
            .from(roles)
            .where(and(eq(roles.isAdmin, true), eq(roles.orgId, orgId)))
            .limit(1);

        if (adminRole.length === 0) {
            return next(
                createHttpError(HttpCode.NOT_FOUND, `Admin role not found`)
            );
        }

        const niceId = await getUniqueResourcePolicyName(orgId);

        const policy = await db.transaction(async (trx) => {
            const [newPolicy] = await trx
                .insert(resourcePolicies)
                .values({
                    niceId,
                    orgId,
                    name,
                    sso
                })
                .returning();

            await trx.insert(rolePolicies).values({
                roleId: adminRole[0].roleId,
                resourcePolicyId: newPolicy.resourcePolicyId
            });

            if (req.user && req.userOrgRoleId != adminRole[0].roleId) {
                // make sure the user can access the policy
                await trx.insert(userPolicies).values({
                    userId: req.user?.userId!,
                    resourcePolicyId: newPolicy.resourcePolicyId
                });
            }

            return newPolicy;
        });

        if (!policy) {
            return next(
                createHttpError(
                    HttpCode.INTERNAL_SERVER_ERROR,
                    "Failed to create policy"
                )
            );
        }
        return response<ResourcePolicy>(res, {
            data: policy,
            success: true,
            error: false,
            message: "resource policy created successfully",
            status: HttpCode.CREATED
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
