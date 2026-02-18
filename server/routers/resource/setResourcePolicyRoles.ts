import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import { resourcePolicies, resources, roleResources, roles } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { eq, and, ne, inArray } from "drizzle-orm";
import { OpenAPITags, registry } from "@server/openApi";

const setResourcePolicyRolesBodySchema = z.strictObject({
    roleIds: z.array(z.int().positive())
});

const setResourcePolicyRolesParamsSchema = z.strictObject({
    resourcePolicyId: z.string().transform(Number).pipe(z.int().positive())
});

registry.registerPath({
    method: "post",
    path: "/resource-policy/{resourcePolicyId}/roles",
    description:
        "Set roles for a resource policy. This will replace all existing roles across all resources under this policy.",
    tags: [OpenAPITags.Resource, OpenAPITags.Role],
    request: {
        params: setResourcePolicyRolesParamsSchema,
        body: {
            content: {
                "application/json": {
                    schema: setResourcePolicyRolesBodySchema
                }
            }
        }
    },
    responses: {}
});

export async function setResourcePolicyRoles(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedBody = setResourcePolicyRolesBodySchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { roleIds } = parsedBody.data;

        const parsedParams = setResourcePolicyRolesParamsSchema.safeParse(
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

        const { resourcePolicyId } = parsedParams.data;

        const [policy] = await db
            .select()
            .from(resourcePolicies)
            .where(eq(resourcePolicies.resourcePolicyId, resourcePolicyId))
            .limit(1);

        if (!policy) {
            return next(
                createHttpError(HttpCode.NOT_FOUND, "Resource policy not found")
            );
        }

        // Check if any of the roleIds are admin roles
        const rolesToCheck = await db
            .select()
            .from(roles)
            .where(
                and(
                    inArray(roles.roleId, roleIds),
                    eq(roles.orgId, policy.orgId)
                )
            );

        const hasAdminRole = rolesToCheck.some((role) => role.isAdmin);
        if (hasAdminRole) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "Admin role cannot be assigned to resource policies"
                )
            );
        }

        // Get admin role IDs for this org to exclude from deletion
        const adminRoles = await db
            .select()
            .from(roles)
            .where(
                and(eq(roles.isAdmin, true), eq(roles.orgId, policy.orgId))
            );
        const adminRoleIds = adminRoles.map((role) => role.roleId);

        // Get all resources under this policy
        const policyResources = await db
            .select({ resourceId: resources.resourceId })
            .from(resources)
            .where(eq(resources.resourcePolicyId, resourcePolicyId));

        await db.transaction(async (trx) => {
            // Delete existing role associations for this policy (excluding admin roles)
            if (adminRoleIds.length > 0) {
                await trx.delete(roleResources).where(
                    and(
                        eq(roleResources.resourcePolicyId, resourcePolicyId),
                        ne(roleResources.roleId, adminRoleIds[0])
                    )
                );
            } else {
                await trx
                    .delete(roleResources)
                    .where(
                        eq(roleResources.resourcePolicyId, resourcePolicyId)
                    );
            }

            // Insert new role associations for each resource under the policy
            if (roleIds.length > 0 && policyResources.length > 0) {
                await Promise.all(
                    policyResources.flatMap(({ resourceId }) =>
                        roleIds.map((roleId) =>
                            trx
                                .insert(roleResources)
                                .values({ roleId, resourceId, resourcePolicyId })
                                .returning()
                        )
                    )
                );
            }

            return response(res, {
                data: {},
                success: true,
                error: false,
                message: "Roles set for resource policy successfully",
                status: HttpCode.CREATED
            });
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
