import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { aiModels, aiProviders, db } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";
import { and, eq } from "drizzle-orm";
import type { GetAiModelResponse } from "@server/routers/aiProvider/types";

const paramsSchema = z.strictObject({
    orgId: z.string().nonempty(),
    providerId: z.coerce.number().int().positive(),
    modelId: z.coerce.number().int().positive()
});

registry.registerPath({
    method: "get",
    path: "/org/{orgId}/ai-provider/{providerId}/model/{modelId}",
    description: "Get an AI model by ID.",
    tags: [OpenAPITags.AiModel],
    request: {
        params: paramsSchema
    },
    responses: {
        200: {
            description: "Successful response"
        }
    }
});

export async function getAiModel(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = paramsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { orgId, providerId, modelId } = parsedParams.data;

        const [model] =
            req.aiModel && req.aiModel.modelId === modelId
                ? [req.aiModel]
                : await db
                      .select({ model: aiModels })
                      .from(aiModels)
                      .innerJoin(
                          aiProviders,
                          eq(aiModels.providerId, aiProviders.providerId)
                      )
                      .where(
                          and(
                              eq(aiModels.modelId, modelId),
                              eq(aiModels.providerId, providerId),
                              eq(aiProviders.orgId, orgId)
                          )
                      )
                      .limit(1)
                      .then((rows) => rows.map((r) => r.model));

        if (!model) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `AI model with ID ${modelId} not found`
                )
            );
        }

        return response<GetAiModelResponse>(res, {
            data: { model },
            success: true,
            error: false,
            message: "AI model retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
