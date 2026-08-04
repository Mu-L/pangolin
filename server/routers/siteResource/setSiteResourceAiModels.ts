import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db, siteResources, siteResourceAiModels } from "@server/db";
import { eq } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";
import {
    assertSiteAllowlistApiEligible,
    assertModelsBelongToSiteAllowlistProviders
} from "@server/lib/aiInferenceResource";

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
        "Replace the allowlist of catalog models for an inference site resource. Requires at least one attached AI provider in allowlist mode. Models must belong to a provider attached in allowlist mode. An empty array denies all models.",
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

        const eligibleError =
            await assertSiteAllowlistApiEligible(siteResource);
        if (eligibleError) {
            return next(createHttpError(HttpCode.BAD_REQUEST, eligibleError));
        }

        const modelError = await assertModelsBelongToSiteAllowlistProviders({
            orgId: siteResource.orgId,
            siteResourceId,
            modelIds
        });
        if (modelError) {
            return next(createHttpError(HttpCode.BAD_REQUEST, modelError));
        }

        await db.transaction(async (trx) => {
            await trx
                .delete(siteResourceAiModels)
                .where(eq(siteResourceAiModels.siteResourceId, siteResourceId));

            if (modelIds.length > 0) {
                await trx.insert(siteResourceAiModels).values(
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
