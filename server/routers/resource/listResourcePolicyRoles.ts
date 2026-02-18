import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import { roleResources, roles } from "@server/db";
import { eq } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";

const listResourcePolicyRolesSchema = z.strictObject({
    resourcePolicyId: z.string().transform(Number).pipe(z.int().positive())
});

async function query(resourcePolicyId: number) {
    return await db
        .selectDistinct({
            roleId: roles.roleId,
            name: roles.name,
            description: roles.description,
            isAdmin: roles.isAdmin
        })
        .from(roleResources)
        .innerJoin(roles, eq(roleResources.roleId, roles.roleId))
        .where(eq(roleResources.resourcePolicyId, resourcePolicyId));
}

export type ListResourcePolicyRolesResponse = {
    roles: NonNullable<Awaited<ReturnType<typeof query>>>;
};

registry.registerPath({
    method: "get",
    path: "/resource-policy/{resourcePolicyId}/roles",
    description: "List all roles for a resource policy.",
    tags: [OpenAPITags.Resource, OpenAPITags.Role],
    request: {
        params: listResourcePolicyRolesSchema
    },
    responses: {}
});

export async function listResourcePolicyRoles(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = listResourcePolicyRolesSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { resourcePolicyId } = parsedParams.data;

        const policyRolesList = await query(resourcePolicyId);

        return response<ListResourcePolicyRolesResponse>(res, {
            data: {
                roles: policyRolesList
            },
            success: true,
            error: false,
            message: "Resource policy roles retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
