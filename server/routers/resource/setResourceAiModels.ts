import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db, resources, resourceAiModels, aiModels } from "@server/db";
import { eq, and, inArray } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";

const setResourceAiModelsBodySchema = z.strictObject({
    modelIds: z.array(z.int().positive())
});

const setResourceAiModelsParamsSchema = z.strictObject({
    resourceId: z.coerce.number().int().positive()
});

registry.registerPath({
    method: "post",
    path: "/resource/{resourceId}/ai-models",
    description:
        "Set the AI models a resource is restricted to. This replaces all existing restrictions. Pass an empty array to remove the restriction (allow every enabled model on the linked provider).",
    tags: [OpenAPITags.PublicResource],
    request: {
        params: setResourceAiModelsParamsSchema,
        body: {
            content: {
                "application/json": {
                    schema: setResourceAiModelsBodySchema
                }
            }
        }
    },
    responses: {
        200: {
            description: "Successful response",
            content: {
                "application/json": {
                    schema: z.object({
                        data: z.record(z.string(), z.any()).nullable(),
                        success: z.boolean(),
                        error: z.boolean(),
                        message: z.string(),
                        status: z.number()
                    })
                }
            }
        }
    }
});

export async function setResourceAiModels(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedBody = setResourceAiModelsBodySchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { modelIds } = parsedBody.data;

        const parsedParams = setResourceAiModelsParamsSchema.safeParse(
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
            .select()
            .from(resources)
            .where(eq(resources.resourceId, resourceId))
            .limit(1);

        if (!resource) {
            return next(
                createHttpError(HttpCode.NOT_FOUND, "Resource not found")
            );
        }

        if (modelIds.length > 0) {
            if (!resource.aiProviderId) {
                return next(
                    createHttpError(
                        HttpCode.BAD_REQUEST,
                        "Resource has no AI provider linked"
                    )
                );
            }

            const validModels = await db
                .select({ modelId: aiModels.modelId })
                .from(aiModels)
                .where(
                    and(
                        inArray(aiModels.modelId, modelIds),
                        eq(aiModels.providerId, resource.aiProviderId)
                    )
                );

            if (validModels.length !== new Set(modelIds).size) {
                return next(
                    createHttpError(
                        HttpCode.BAD_REQUEST,
                        "One or more model IDs do not exist or do not belong to this resource's AI provider"
                    )
                );
            }
        }

        await db.transaction(async (trx) => {
            await trx
                .delete(resourceAiModels)
                .where(eq(resourceAiModels.resourceId, resourceId));

            if (modelIds.length > 0) {
                await trx
                    .insert(resourceAiModels)
                    .values(
                        modelIds.map((modelId) => ({ resourceId, modelId }))
                    );
            }
        });

        return response(res, {
            data: {},
            success: true,
            error: false,
            message: "AI models set for resource successfully",
            status: HttpCode.CREATED
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
