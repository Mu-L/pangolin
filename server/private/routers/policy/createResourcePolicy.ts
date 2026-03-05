import { Request, Response, NextFunction } from "express";
import z from "zod";
import { OpenAPITags, registry } from "@server/openApi";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import { fromError } from "zod-validation-error";
import {
    db,
    idp,
    idpOrg,
    orgs,
    resourcePolicies,
    rolePolicies,
    roles,
    userOrgs,
    userPolicies,
    users,
    type ResourcePolicy
} from "@server/db";
import { and, eq, inArray, not, type InferInsertModel } from "drizzle-orm";
import logger from "@server/logger";
import { getUniqueResourcePolicyName } from "@server/db/names";
import response from "@server/lib/response";

const createResourcePolicyParamsSchema = z.strictObject({
    orgId: z.string()
});

const ruleSchema = z.strictObject({
    action: z.enum(["ACCEPT", "DROP", "PASS"]).openapi({
        type: "string",
        enum: ["ACCEPT", "DROP", "PASS"],
        description: "rule action"
    }),
    match: z.enum(["CIDR", "IP", "PATH"]).openapi({
        type: "string",
        enum: ["CIDR", "IP", "PATH"],
        description: "rule match"
    }),
    value: z.string().min(1),
    priority: z.int().openapi({
        type: "integer",
        description: "Rule priority"
    }),
    enabled: z.boolean().optional()
});

const createResourcePolicyBodySchema = z.strictObject({
    name: z.string().min(1).max(255),
    // Access control
    sso: z.boolean().default(true),
    skipToIdpId: z
        .int()
        .positive()
        .optional()
        .nullable()
        .openapi({ type: "integer" }),
    roleIds: z
        .array(z.string().transform(Number).pipe(z.int().positive()))
        .optional()
        .default([]),
    userIds: z.array(z.string()).optional().default([]),
    // auth methods
    password: z.string().min(4).max(100).nullable().optional(),
    pincode: z
        .string()
        .regex(/^\d{6}$/)
        .or(z.null())
        .optional(),
    headerAuth: z
        .object({
            user: z.string().min(4).max(100),
            password: z.string().min(4).max(100),
            extendedCompatibility: z.boolean()
        })
        .nullable()
        .optional(),
    // email OTP
    emailWhitelistEnabled: z.boolean().optional().default(false),
    emails: z
        .array(
            z.email().or(
                z.string().regex(/^\*@[\w.-]+\.[a-zA-Z]{2,}$/, {
                    error: "Invalid email address. Wildcard (*) must be the entire local part."
                })
            )
        )
        .max(50)
        .transform((v) => v.map((e) => e.toLowerCase()))
        .optional()
        .default([]),
    // rules
    applyRules: z.boolean().default(false),
    rules: z.array(ruleSchema).optional().default([])
});

registry.registerPath({
    method: "post",
    path: "/org/{orgId}/resource-policy",
    description: "Create a resource policy.",
    tags: [OpenAPITags.Org, OpenAPITags.Policy],
    request: {
        params: createResourcePolicyParamsSchema,
        body: {
            content: {
                "application/json": {
                    schema: createResourcePolicyBodySchema
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

        // Check if Identity provider in `skipToIdpId` exists
        if (skipToIdpId) {
            const [provider] = await db
                .select()
                .from(idp)
                .innerJoin(idpOrg, eq(idpOrg.idpId, idp.idpId))
                .where(and(eq(idp.idpId, skipToIdpId), eq(idpOrg.orgId, orgId)))
                .limit(1);

            if (!provider) {
                return next(
                    createHttpError(
                        HttpCode.INTERNAL_SERVER_ERROR,
                        "Identity provider not found in this organization"
                    )
                );
            }
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

        const existingRoles = await db
            .select()
            .from(roles)
            .where(and(inArray(roles.roleId, roleIds)));

        const hasAdminRole = existingRoles.some((role) => role.isAdmin);

        if (hasAdminRole) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "Admin role cannot be assigned to resource policy"
                )
            );
        }

        const existingUsers = await db
            .select()
            .from(users)
            .innerJoin(userOrgs, eq(userOrgs.userId, users.userId))
            .where(
                and(eq(userOrgs.orgId, orgId), inArray(users.userId, userIds))
            );

        const niceId = await getUniqueResourcePolicyName(orgId);

        const policy = await db.transaction(async (trx) => {
            const [newPolicy] = await trx
                .insert(resourcePolicies)
                .values({
                    niceId,
                    orgId,
                    name,
                    sso,
                    idpId: skipToIdpId
                })
                .returning();

            const rolesToAdd = [
                {
                    roleId: adminRole[0].roleId,
                    resourcePolicyId: newPolicy.resourcePolicyId
                }
            ] satisfies InferInsertModel<typeof rolePolicies>[];

            rolesToAdd.push(
                ...existingRoles.map((role) => ({
                    roleId: role.roleId,
                    resourcePolicyId: newPolicy.resourcePolicyId
                }))
            );

            await trx.insert(rolePolicies).values(rolesToAdd);

            const usersToAdd: InferInsertModel<typeof userPolicies>[] = [];

            if (req.user && req.userOrgRoleId != adminRole[0].roleId) {
                // make sure the user can access the policy
                usersToAdd.push({
                    userId: req.user?.userId!,
                    resourcePolicyId: newPolicy.resourcePolicyId
                });
            }

            usersToAdd.push(
                ...existingUsers.map(({ user }) => ({
                    userId: user.userId,
                    resourcePolicyId: newPolicy.resourcePolicyId
                }))
            );

            if (usersToAdd.length > 0) {
                await trx.insert(userPolicies).values(usersToAdd);
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
