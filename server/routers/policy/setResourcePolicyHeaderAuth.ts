import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db, resourcePolicyHeaderAuth } from "@server/db";
import { eq } from "drizzle-orm";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import { fromError } from "zod-validation-error";
import { response } from "@server/lib/response";
import logger from "@server/logger";
import { hashPassword } from "@server/auth/password";
import { OpenAPITags, registry } from "@server/openApi";

const setResourcePolicyHeaderAuthParamsSchema = z.object({
    resourcePolicyId: z.string().transform(Number).pipe(z.int().positive())
});

const setResourcePolicyHeaderAuthBodySchema = z.strictObject({
    user: z.string().min(4).max(100).nullable(),
    password: z.string().min(4).max(100).nullable(),
    extendedCompatibility: z.boolean().nullable()
});

registry.registerPath({
    method: "post",
    path: "/resource-policy/{resourcePolicyId}/header-auth",
    description:
        "Set or update the header authentication for a resource policy. If user and password is not provided, it will remove the header authentication.",
    tags: [OpenAPITags.Resource],
    request: {
        params: setResourcePolicyHeaderAuthParamsSchema,
        body: {
            content: {
                "application/json": {
                    schema: setResourcePolicyHeaderAuthBodySchema
                }
            }
        }
    },
    responses: {}
});

export async function setResourcePolicyHeaderAuth(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = setResourcePolicyHeaderAuthParamsSchema.safeParse(
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

        const parsedBody = setResourcePolicyHeaderAuthBodySchema.safeParse(
            req.body
        );
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { resourcePolicyId } = parsedParams.data;
        const { user, password, extendedCompatibility } = parsedBody.data;

        await db.transaction(async (trx) => {
            await trx
                .delete(resourcePolicyHeaderAuth)
                .where(
                    eq(
                        resourcePolicyHeaderAuth.resourcePolicyId,
                        resourcePolicyId
                    )
                );

            if (user && password && extendedCompatibility !== null) {
                const headerAuthHash = await hashPassword(
                    Buffer.from(`${user}:${password}`).toString("base64")
                );

                await trx.insert(resourcePolicyHeaderAuth).values({
                    resourcePolicyId,
                    headerAuthHash,
                    extendedCompatibility: extendedCompatibility
                });
            }
        });

        return response(res, {
            data: {},
            success: true,
            error: false,
            message: "Header Authentication set successfully",
            status: HttpCode.CREATED
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
