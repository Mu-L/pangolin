import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
    db,
    siteResources,
    siteResourceAiModels,
    aiModels
} from "@server/db";
import { eq, and, inArray } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";

const setSiteResourceAiModelsBodySchema = z.strictObject({
    modelIds: z.array(z.int().positive())
});

const setSiteResourceAiModelsParamsSchema = z.strictObject({
    siteResourceId: z.coerce.number().int().positive()
});

registry.registerPath({
    method: "post",
    path: "/site-resource/{siteResourceId}/ai-models",
    description:
        "Set the AI models a site resource is restricted to. This replaces all existing restrictions. Pass an empty array to remove the restriction (allow every enabled model on the linked provider).",
    tags: [OpenAPITags.PrivateResource],
    request: {
        params: setSiteResourceAiModelsParamsSchema,
        body: {
            content: {
                "application/json": {
                    schema: setSiteResourceAiModelsBodySchema
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

export async function setSiteResourceAiModels(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedBody = setSiteResourceAiModelsBodySchema.safeParse(
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

        const { modelIds } = parsedBody.data;

        const parsedParams = setSiteResourceAiModelsParamsSchema.safeParse(
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

        const { siteResourceId } = parsedParams.data;

        const [siteResource] = await db
            .select()
            .from(siteResources)
            .where(eq(siteResources.siteResourceId, siteResourceId))
            .limit(1);

        if (!siteResource) {
            return next(
                createHttpError(HttpCode.NOT_FOUND, "Site resource not found")
            );
        }

        if (modelIds.length > 0) {
            if (!siteResource.aiProviderId) {
                return next(
                    createHttpError(
                        HttpCode.BAD_REQUEST,
                        "Site resource has no AI provider linked"
                    )
                );
            }

            const validModels = await db
                .select({ modelId: aiModels.modelId })
                .from(aiModels)
                .where(
                    and(
                        inArray(aiModels.modelId, modelIds),
                        eq(aiModels.providerId, siteResource.aiProviderId)
                    )
                );

            if (validModels.length !== new Set(modelIds).size) {
                return next(
                    createHttpError(
                        HttpCode.BAD_REQUEST,
                        "One or more model IDs do not exist or do not belong to this site resource's AI provider"
                    )
                );
            }
        }

        await db.transaction(async (trx) => {
            await trx
                .delete(siteResourceAiModels)
                .where(
                    eq(siteResourceAiModels.siteResourceId, siteResourceId)
                );

            if (modelIds.length > 0) {
                await trx
                    .insert(siteResourceAiModels)
                    .values(
                        modelIds.map((modelId) => ({
                            siteResourceId,
                            modelId
                        }))
                    );
            }
        });

        return response(res, {
            data: {},
            success: true,
            error: false,
            message: "AI models set for site resource successfully",
            status: HttpCode.CREATED
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
