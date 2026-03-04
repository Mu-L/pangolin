import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import { userResources } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { eq } from "drizzle-orm";
import { OpenAPITags, registry } from "@server/openApi";

const setUserResourcesBodySchema = z.strictObject({
    userIds: z.array(z.string())
});

const setUserResourcesParamsSchema = z.strictObject({
    resourceId: z.string().transform(Number).pipe(z.int().positive())
});

registry.registerPath({
    method: "post",
    path: "/resource/{resourceId}/users",
    description:
        "Set users for a resource. This will replace all existing users.",
    tags: [OpenAPITags.PublicResource, OpenAPITags.User],
    request: {
        params: setUserResourcesParamsSchema,
        body: {
            content: {
                "application/json": {
                    schema: setUserResourcesBodySchema
                }
            }
        }
    },
    responses: {}
});

export async function setResourceUsers(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedBody = setUserResourcesBodySchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { userIds } = parsedBody.data;

        const parsedParams = setUserResourcesParamsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { resourceId } = parsedParams.data;

        await db.transaction(async (trx) => {
            await trx
                .delete(userResources)
                .where(eq(userResources.resourceId, resourceId));

            const newUserResources = await Promise.all(
                userIds.map((userId) =>
                    trx
                        .insert(userResources)
                        .values({ userId, resourceId })
                        .returning()
                )
            );

            return response(res, {
                data: {},
                success: true,
                error: false,
                message: "Users set for resource successfully",
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
