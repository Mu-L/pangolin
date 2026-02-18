import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import { resourcePolicies, resources, userResources } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { eq } from "drizzle-orm";
import { OpenAPITags, registry } from "@server/openApi";

const setResourcePolicyUsersBodySchema = z.strictObject({
    userIds: z.array(z.string())
});

const setResourcePolicyUsersParamsSchema = z.strictObject({
    resourcePolicyId: z.string().transform(Number).pipe(z.int().positive())
});

registry.registerPath({
    method: "post",
    path: "/resource-policy/{resourcePolicyId}/users",
    description:
        "Set users for a resource policy. This will replace all existing users across all resources under this policy.",
    tags: [OpenAPITags.Resource, OpenAPITags.User],
    request: {
        params: setResourcePolicyUsersParamsSchema,
        body: {
            content: {
                "application/json": {
                    schema: setResourcePolicyUsersBodySchema
                }
            }
        }
    },
    responses: {}
});

export async function setResourcePolicyUsers(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedBody = setResourcePolicyUsersBodySchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { userIds } = parsedBody.data;

        const parsedParams = setResourcePolicyUsersParamsSchema.safeParse(
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

        const [policy] = await db
            .select()
            .from(resourcePolicies)
            .where(eq(resourcePolicies.resourcePolicyId, resourcePolicyId))
            .limit(1);

        if (!policy) {
            return next(
                createHttpError(HttpCode.NOT_FOUND, "Resource policy not found")
            );
        }

        // Get all resources under this policy
        const policyResources = await db
            .select({ resourceId: resources.resourceId })
            .from(resources)
            .where(eq(resources.resourcePolicyId, resourcePolicyId));

        await db.transaction(async (trx) => {
            // Delete existing user associations for this policy
            await trx
                .delete(userResources)
                .where(eq(userResources.resourcePolicyId, resourcePolicyId));

            // Insert new user associations for each resource under the policy
            if (userIds.length > 0 && policyResources.length > 0) {
                await Promise.all(
                    policyResources.flatMap(({ resourceId }) =>
                        userIds.map((userId) =>
                            trx
                                .insert(userResources)
                                .values({ userId, resourceId, resourcePolicyId })
                                .returning()
                        )
                    )
                );
            }

            return response(res, {
                data: {},
                success: true,
                error: false,
                message: "Users set for resource policy successfully",
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
