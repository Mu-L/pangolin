import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { aiProviders, db } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";
import { encrypt } from "@server/lib/crypto";
import config from "@server/lib/config";
import type { CreateOrEditAiProviderResponse } from "@server/routers/aiProvider/types";
import { toPublicAiProvider } from "@server/routers/aiProvider/types";
import {
    aiAuthTypeSchema,
    aiBudgetUnitSchema,
    aiProviderTypeSchema,
    refineBudgetFields,
    refineProviderUpstreamFields
} from "@server/routers/aiProvider/validation";

const paramsSchema = z.strictObject({
    orgId: z.string().nonempty()
});

const bodySchema = z
    .strictObject({
        name: z.string().nonempty(),
        type: aiProviderTypeSchema,
        upstreamUrl: z.url().optional().nullable(),
        apiKey: z.string().optional(),
        authType: aiAuthTypeSchema.optional().nullable(),
        skipTlsVerification: z.boolean().optional(),
        budgetAmount: z.number().positive().optional().nullable(),
        budgetUnit: aiBudgetUnitSchema.optional().nullable(),
        enabled: z.boolean().optional()
    })
    .superRefine((data, ctx) => {
        refineProviderUpstreamFields(data, ctx);
        refineBudgetFields(data, ctx);
    });

registry.registerPath({
    method: "put",
    path: "/org/{orgId}/ai-provider",
    description: "Create an AI provider for an organization.",
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
        201: {
            description: "Successful response"
        }
    }
});

export async function createAiProvider(
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

        const { orgId } = parsedParams.data;
        const {
            name,
            type,
            upstreamUrl,
            apiKey,
            authType,
            skipTlsVerification,
            budgetAmount,
            budgetUnit,
            enabled
        } = parsedBody.data;

        const key = config.getRawConfig().server.secret!;
        const encryptedApiKey = apiKey ? encrypt(apiKey, key) : null;
        const apiKeyLastChars = apiKey ? apiKey.slice(-4) : null;
        const now = Date.now();

        const [provider] = await db
            .insert(aiProviders)
            .values({
                orgId,
                name,
                type,
                upstreamUrl: upstreamUrl ?? null,
                apiKey: encryptedApiKey,
                apiKeyLastChars,
                authType: authType ?? null,
                skipTlsVerification: skipTlsVerification ?? false,
                budgetAmount: budgetAmount ?? null,
                budgetUnit: budgetUnit ?? null,
                enabled: enabled ?? true,
                createdAt: now,
                updatedAt: now
            })
            .returning();

        return response<CreateOrEditAiProviderResponse>(res, {
            data: { provider: toPublicAiProvider(provider) },
            success: true,
            error: false,
            message: "AI provider created successfully",
            status: HttpCode.CREATED
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
