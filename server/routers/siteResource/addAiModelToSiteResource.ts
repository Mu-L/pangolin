import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
    db,
    siteResources,
    siteResourceAiModels,
    aiModels
} from "@server/db";
import { eq, and } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";

const addAiModelToSiteResourceBodySchema = z.strictObject({
    modelId: z.int().positive()
});

const addAiModelToSiteResourceParamsSchema = z.strictObject({
    siteResourceId: z.coerce.number().int().positive()
});

registry.registerPath({
    method: "post",
    path: "/site-resource/{siteResourceId}/ai-models/add",
    description:
        "Add a single AI model to a site resource's model restriction allow-list.",
    tags: [OpenAPITags.PrivateResource],
    request: {
        params: addAiModelToSiteResourceParamsSchema,
        body: {
            content: {
                "application/json": {
                    schema: addAiModelToSiteResourceBodySchema
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

export async function addAiModelToSiteResource(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedBody = addAiModelToSiteResourceBodySchema.safeParse(
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

        const { modelId } = parsedBody.data;

        const parsedParams = addAiModelToSiteResourceParamsSchema.safeParse(
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

        if (!siteResource.aiProviderId) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "Site resource has no AI provider linked"
                )
            );
        }

        const [model] = await db
            .select()
            .from(aiModels)
            .where(
                and(
                    eq(aiModels.modelId, modelId),
                    eq(aiModels.providerId, siteResource.aiProviderId)
                )
            )
            .limit(1);

        if (!model) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    "Model not found or does not belong to this site resource's AI provider"
                )
            );
        }

        const existingEntry = await db
            .select()
            .from(siteResourceAiModels)
            .where(
                and(
                    eq(siteResourceAiModels.siteResourceId, siteResourceId),
                    eq(siteResourceAiModels.modelId, modelId)
                )
            );

        if (existingEntry.length > 0) {
            return next(
                createHttpError(
                    HttpCode.CONFLICT,
                    "Model already assigned to site resource"
                )
            );
        }

        await db
            .insert(siteResourceAiModels)
            .values({ siteResourceId, modelId });

        return response(res, {
            data: {},
            success: true,
            error: false,
            message: "Model added to site resource successfully",
            status: HttpCode.CREATED
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
