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

const listResourceRolesSchema = z.strictObject({
    resourceId: z.string().transform(Number).pipe(z.int().positive())
});

async function query(resourceId: number) {
    return await db
        .select({
            roleId: roles.roleId,
            name: roles.name,
            description: roles.description,
            isAdmin: roles.isAdmin
        })
        .from(roleResources)
        .innerJoin(roles, eq(roleResources.roleId, roles.roleId))
        .where(eq(roleResources.resourceId, resourceId));
}

export type ListResourceRolesResponse = {
    roles: NonNullable<Awaited<ReturnType<typeof query>>>;
};

registry.registerPath({
    method: "get",
    path: "/resource/{resourceId}/roles",
    description: "List all roles for a resource.",
    tags: [OpenAPITags.PublicResource, OpenAPITags.Role],
    request: {
        params: listResourceRolesSchema
    },
    responses: {}
});

export async function listResourceRoles(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = listResourceRolesSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { resourceId } = parsedParams.data;

        const resourceRolesList = await query(resourceId);

        return response<ListResourceRolesResponse>(res, {
            data: {
                roles: resourceRolesList
            },
            success: true,
            error: false,
            message: "Resource roles retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
