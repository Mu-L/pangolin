import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import { idp, userResources, users } from "@server/db";
import { eq } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";

const listResourcePolicyUsersSchema = z.strictObject({
    resourcePolicyId: z.string().transform(Number).pipe(z.int().positive())
});

async function queryUsers(resourcePolicyId: number) {
    return await db
        .selectDistinct({
            userId: userResources.userId,
            username: users.username,
            type: users.type,
            idpName: idp.name,
            idpId: users.idpId,
            email: users.email
        })
        .from(userResources)
        .innerJoin(users, eq(userResources.userId, users.userId))
        .leftJoin(idp, eq(users.idpId, idp.idpId))
        .where(eq(userResources.resourcePolicyId, resourcePolicyId));
}

export type ListResourcePolicyUsersResponse = {
    users: NonNullable<Awaited<ReturnType<typeof queryUsers>>>;
};

registry.registerPath({
    method: "get",
    path: "/resource-policy/{resourcePolicyId}/users",
    description: "List all users for a resource policy.",
    tags: [OpenAPITags.Resource, OpenAPITags.User],
    request: {
        params: listResourcePolicyUsersSchema
    },
    responses: {}
});

export async function listResourcePolicyUsers(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = listResourcePolicyUsersSchema.safeParse(
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

        const policyUsersList = await queryUsers(resourcePolicyId);

        return response<ListResourcePolicyUsersResponse>(res, {
            data: {
                users: policyUsersList
            },
            success: true,
            error: false,
            message: "Resource policy users retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
