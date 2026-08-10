import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { aiProviders, db } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";
import { eq } from "drizzle-orm";
import {
    aiModelCatalog,
    getCatalogProviderForType
} from "@server/lib/aiModelCatalog";
import type { AiProviderType } from "@server/lib/aiProviderDefaults";
import type { ListCatalogModelsResponse } from "@server/routers/aiProvider/types";

const paramsSchema = z.strictObject({
    providerId: z.coerce.number().int().positive()
});

const listSchema = z.object({
    query: z.string().optional()
});

registry.registerPath({
    method: "get",
    path: "/ai-provider/{providerId}/catalog-models",
    description:
        "List known catalog models for an AI provider's type. Used for model key suggestions.",
    tags: [OpenAPITags.AiModel],
    request: {
        params: paramsSchema,
        query: listSchema
    },
    responses: {
        200: {
            description: "Successful response"
        }
    }
});

export async function listCatalogModels(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedQuery = listSchema.safeParse(req.query);
        if (!parsedQuery.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedQuery.error).toString()
                )
            );
        }

        const parsedParams = paramsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { providerId } = parsedParams.data;

        const [provider] =
            req.aiProvider && req.aiProvider.providerId === providerId
                ? [req.aiProvider]
                : await db
                      .select()
                      .from(aiProviders)
                      .where(eq(aiProviders.providerId, providerId))
                      .limit(1);

        if (!provider) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `AI provider with ID ${providerId} not found`
                )
            );
        }

        const catalogProvider = getCatalogProviderForType(
            provider.type as AiProviderType
        );

        let models = catalogProvider
            ? aiModelCatalog.list(catalogProvider).map((entry) => ({
                  model: entry.model
              }))
            : [];

        const { query } = parsedQuery.data;
        if (query) {
            const q = query.toLowerCase();
            models = models.filter((m) => m.model.toLowerCase().includes(q));
        }

        // Deduplicate model keys (catalog may have duplicates after provider
        // normalization, e.g. bedrock + bedrock_converse).
        const seen = new Set<string>();
        models = models.filter((m) => {
            if (seen.has(m.model)) {
                return false;
            }
            seen.add(m.model);
            return true;
        });

        models.sort((a, b) => a.model.localeCompare(b.model));

        return response<ListCatalogModelsResponse>(res, {
            data: { models },
            success: true,
            error: false,
            message: "Catalog models retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
