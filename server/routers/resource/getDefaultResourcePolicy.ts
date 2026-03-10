import { db, resources } from "@server/db";
import {
    queryResourcePolicy,
    type GetResourcePolicyResponse
} from "@server/routers/policy/getResourcePolicy";
import response from "@server/lib/response";
import logger from "@server/logger";
import { OpenAPITags, registry } from "@server/openApi";
import HttpCode from "@server/types/HttpCode";
import { eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import createHttpError from "http-errors";
import z from "zod";
import { fromError } from "zod-validation-error";

const getResourcePoliciesParamsSchema = z.strictObject({
    resourceId: z.string().transform(Number).pipe(z.int().positive())
});

export type GetDefaultResourcePolicyResponse = GetResourcePolicyResponse;

registry.registerPath({
    method: "get",
    path: "/resource/{resourceId}/default-policy",
    description: "Get the default policy for a resource.",
    tags: [OpenAPITags.PublicResource, OpenAPITags.Policy],
    request: {
        params: getResourcePoliciesParamsSchema
    },
    responses: {}
});

export async function getDefaultResourcePolicy(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = getResourcePoliciesParamsSchema.safeParse(
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

        const [resource] = await db
            .select({
                defaultResourcePolicyId: resources.defaultResourcePolicyId
            })
            .from(resources)
            .where(eq(resources.resourceId, resourceId))
            .limit(1);

        if (!resource) {
            return next(
                createHttpError(HttpCode.NOT_FOUND, "Resource not found")
            );
        }

        if (!resource.defaultResourcePolicyId) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    "Resource has no default policy"
                )
            );
        }

        const defaultPolicy = await queryResourcePolicy({
            resourcePolicyId: resource.defaultResourcePolicyId
        });
        return response<GetDefaultResourcePolicyResponse>(res, {
            data: defaultPolicy,
            success: true,
            error: false,
            message: "Resource policies retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
