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
import { encrypt } from "@server/lib/crypto";
import config from "@server/lib/config";
import type { CreateOrEditAiProviderResponse } from "@server/routers/aiProvider/types";
import { toPublicAiProvider } from "@server/routers/aiProvider/types";
import {
    aiAuthTypeSchema,
    aiProviderTypeSchema,
    aiRoutingModeSchema,
    refineProviderUpstreamFields
} from "@server/routers/aiProvider/validation";
import type {
    AiProviderRoutingMode,
    AiProviderType
} from "@server/lib/aiProviderDefaults";

const paramsSchema = z.strictObject({
    providerId: z.coerce.number().int().positive()
});

const bodySchema = z.strictObject({
    name: z.string().nonempty().optional(),
    upstreamUrl: z.url().optional().nullable(),
    apiKey: z.string().optional(),
    authType: aiAuthTypeSchema.optional().nullable(),
    routingMode: aiRoutingModeSchema.optional(),
    skipTlsVerification: z.boolean().optional(),
    enabled: z.boolean().optional()
});

registry.registerPath({
    method: "post",
    path: "/ai-provider/{providerId}",
    description: "Update an AI provider.",
    tags: [OpenAPITags.AiProvider],
    request: {
        params: paramsSchema,
        body: {
            content: {
                "application/json": {
                    schema: bodySchema
                }
            }
        }
    },
    responses: {
        200: {
            description: "Successful response"
        }
    }
});

export async function updateAiProvider(
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

        const parsedBody = bodySchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { providerId } = parsedParams.data;
        const body = parsedBody.data;

        const [existing] =
            req.aiProvider && req.aiProvider.providerId === providerId
                ? [req.aiProvider]
                : await db
                      .select()
                      .from(aiProviders)
                      .where(eq(aiProviders.providerId, providerId))
                      .limit(1);

        if (!existing) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `AI provider with ID ${providerId} not found`
                )
            );
        }

        const providerType = existing.type as AiProviderType;
        const nextRoutingMode: AiProviderRoutingMode =
            providerType === "custom"
                ? ((body.routingMode ??
                      existing.routingMode) as AiProviderRoutingMode)
                : "url";
        const nextUpstreamUrl =
            body.upstreamUrl !== undefined
                ? body.upstreamUrl
                : existing.upstreamUrl;
        const nextAuthType =
            body.authType !== undefined
                ? body.authType
                : (existing.authType ??
                  (providerType === "custom" ? "bearer" : null));

        const validation = z
            .object({
                type: aiProviderTypeSchema,
                upstreamUrl: z.string().nullable().optional(),
                authType: aiAuthTypeSchema.nullable().optional(),
                routingMode: aiRoutingModeSchema.optional()
            })
            .superRefine((data, ctx) => refineProviderUpstreamFields(data, ctx))
            .safeParse({
                type: providerType,
                upstreamUrl: nextUpstreamUrl,
                authType: nextAuthType,
                routingMode: nextRoutingMode
            });

        if (!validation.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(validation.error).toString()
                )
            );
        }

        const updateData: Partial<typeof aiProviders.$inferInsert> = {
            updatedAt: Date.now(),
            routingMode: nextRoutingMode
        };

        if (body.name !== undefined) {
            updateData.name = body.name;
        }
        if (body.skipTlsVerification !== undefined) {
            updateData.skipTlsVerification = body.skipTlsVerification;
        }
        if (body.enabled !== undefined) {
            updateData.enabled = body.enabled;
        }
        if (nextRoutingMode === "target") {
            updateData.upstreamUrl = null;
        } else if (body.upstreamUrl !== undefined) {
            updateData.upstreamUrl = body.upstreamUrl;
        }
        if (body.authType !== undefined) {
            updateData.authType = body.authType;
        } else if (
            providerType === "custom" &&
            !existing.authType &&
            nextAuthType
        ) {
            // Backfill required authType for custom providers created without one
            updateData.authType = nextAuthType;
        }

        if (body.apiKey !== undefined) {
            const key = config.getRawConfig().server.secret!;
            updateData.apiKey = encrypt(body.apiKey, key);
            updateData.apiKeyLastChars = body.apiKey.slice(-4);
        }

        const [provider] = await db
            .update(aiProviders)
            .set(updateData)
            .where(eq(aiProviders.providerId, providerId))
            .returning();

        return response<CreateOrEditAiProviderResponse>(res, {
            data: {
                provider: toPublicAiProvider(provider, { includeApiKey: true })
            },
            success: true,
            error: false,
            message: "AI provider updated successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
