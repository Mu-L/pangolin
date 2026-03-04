import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import { resourceWhitelist, users } from "@server/db"; // Assuming these are the correct tables
import { eq } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";

const getResourceWhitelistSchema = z.strictObject({
    resourceId: z.string().transform(Number).pipe(z.int().positive())
});

async function queryWhitelist(resourceId: number) {
    return await db
        .select({
            email: resourceWhitelist.email
        })
        .from(resourceWhitelist)
        .where(eq(resourceWhitelist.resourceId, resourceId));
}

export type GetResourceWhitelistResponse = {
    whitelist: NonNullable<Awaited<ReturnType<typeof queryWhitelist>>>;
};

registry.registerPath({
    method: "get",
    path: "/resource/{resourceId}/whitelist",
    description: "Get the whitelist of emails for a specific resource.",
    tags: [OpenAPITags.PublicResource],
    request: {
        params: getResourceWhitelistSchema
    },
    responses: {}
});

export async function getResourceWhitelist(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = getResourceWhitelistSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { resourceId } = parsedParams.data;

        const whitelist = await queryWhitelist(resourceId);

        return response<GetResourceWhitelistResponse>(res, {
            data: {
                whitelist
            },
            success: true,
            error: false,
            message: "Resource whitelist retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
