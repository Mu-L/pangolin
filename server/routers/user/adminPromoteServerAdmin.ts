import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db, users } from "@server/db";
import { eq } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";
import { createApiResponseSchema } from "@server/lib/openapi/createApiResponseSchema";

const promoteServerAdminParamsSchema = z.strictObject({
    userId: z.string()
});

export type AdminPromoteServerAdminResponse = {
    userId: string;
    serverAdmin: boolean;
};

const AdminPromoteServerAdminResponseDataSchema = z.object({
    userId: z.string(),
    serverAdmin: z.boolean()
});

registry.registerPath({
    method: "post",
    path: "/user/{userId}/promote-server-admin",
    description: "Promote a user to server admin (server admin).",
    tags: [OpenAPITags.User],
    request: {
        params: promoteServerAdminParamsSchema
    },
    responses: {
        200: {
            description: "Successful response",
            content: {
                "application/json": {
                    schema: createApiResponseSchema(
                        AdminPromoteServerAdminResponseDataSchema
                    )
                }
            }
        }
    }
});

export async function adminPromoteServerAdmin(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = promoteServerAdminParamsSchema.safeParse(
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

        const { userId } = parsedParams.data;

        const [existingUser] = await db
            .select({
                userId: users.userId,
                serverAdmin: users.serverAdmin
            })
            .from(users)
            .where(eq(users.userId, userId))
            .limit(1);

        if (!existingUser) {
            return next(createHttpError(HttpCode.NOT_FOUND, "User not found"));
        }

        if (existingUser.serverAdmin) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "User is already a server admin"
                )
            );
        }

        logger.info(
            `Promoting user ${userId} to server admin (by ${req.user?.userId})`
        );

        await db
            .update(users)
            .set({ serverAdmin: true })
            .where(eq(users.userId, userId));

        return response<AdminPromoteServerAdminResponse>(res, {
            data: {
                userId: existingUser.userId,
                serverAdmin: true
            },
            success: true,
            error: false,
            message: "User promoted to server admin successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
