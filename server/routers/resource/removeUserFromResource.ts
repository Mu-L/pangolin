import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db, resources } from "@server/db";
import { userResources } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { eq, and } from "drizzle-orm";
import { OpenAPITags, registry } from "@server/openApi";

const removeUserFromResourceBodySchema = z
    .object({
        userId: z.string()
    })
    .strict();

const removeUserFromResourceParamsSchema = z
    .object({
        resourceId: z
            .string()
            .transform(Number)
            .pipe(z.number().int().positive())
    })
    .strict();

registry.registerPath({
    method: "post",
    path: "/resource/{resourceId}/users/remove",
    description: "Remove a single user from a resource.",
    tags: [OpenAPITags.PublicResource, OpenAPITags.User],
    request: {
        params: removeUserFromResourceParamsSchema,
        body: {
            content: {
                "application/json": {
                    schema: removeUserFromResourceBodySchema
                }
            }
        }
    },
    responses: {}
});

export async function removeUserFromResource(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedBody = removeUserFromResourceBodySchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { userId } = parsedBody.data;

        const parsedParams = removeUserFromResourceParamsSchema.safeParse(
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

        const { resourceId } = parsedParams.data;

        // get the resource
        const [resource] = await db
            .select()
            .from(resources)
            .where(eq(resources.resourceId, resourceId))
            .limit(1);

        if (!resource) {
            return next(
                createHttpError(HttpCode.NOT_FOUND, "Resource not found")
            );
        }

        // Check if user exists in resource
        const existingEntry = await db
            .select()
            .from(userResources)
            .where(
                and(
                    eq(userResources.resourceId, resourceId),
                    eq(userResources.userId, userId)
                )
            );

        if (existingEntry.length === 0) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    "User not found in resource"
                )
            );
        }

        await db
            .delete(userResources)
            .where(
                and(
                    eq(userResources.resourceId, resourceId),
                    eq(userResources.userId, userId)
                )
            );

        return response(res, {
            data: {},
            success: true,
            error: false,
            message: "User removed from resource successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
