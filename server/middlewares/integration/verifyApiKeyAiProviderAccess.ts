import { Request, Response, NextFunction } from "express";
import { aiProviders, apiKeyOrg, db } from "@server/db";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import HttpCode from "@server/types/HttpCode";
import { getFirstString } from "@server/lib/requestParams";

export async function verifyApiKeyAiProviderAccess(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const apiKey = req.apiKey;
        const providerIdRaw = getFirstString(req.params.providerId);
        const providerId = Number.parseInt(providerIdRaw ?? "", 10);
        const orgId = getFirstString(req.params.orgId);

        if (!apiKey) {
            return next(
                createHttpError(HttpCode.UNAUTHORIZED, "Key not authenticated")
            );
        }

        if (!orgId) {
            return next(
                createHttpError(HttpCode.BAD_REQUEST, "Invalid organization ID")
            );
        }

        if (Number.isNaN(providerId)) {
            return next(
                createHttpError(HttpCode.BAD_REQUEST, "Invalid provider ID")
            );
        }

        if (apiKey.isRoot) {
            const [provider] = await db
                .select()
                .from(aiProviders)
                .where(
                    and(
                        eq(aiProviders.providerId, providerId),
                        eq(aiProviders.orgId, orgId)
                    )
                )
                .limit(1);

            if (!provider) {
                return next(
                    createHttpError(
                        HttpCode.NOT_FOUND,
                        `AI provider with ID ${providerId} not found`
                    )
                );
            }

            req.aiProvider = provider;
            return next();
        }

        const [provider] = await db
            .select()
            .from(aiProviders)
            .where(
                and(
                    eq(aiProviders.providerId, providerId),
                    eq(aiProviders.orgId, orgId)
                )
            )
            .limit(1);

        if (!provider) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `AI provider with ID ${providerId} not found`
                )
            );
        }

        if (!req.apiKeyOrg) {
            const apiKeyOrgRes = await db
                .select()
                .from(apiKeyOrg)
                .where(
                    and(
                        eq(apiKeyOrg.apiKeyId, apiKey.apiKeyId),
                        eq(apiKeyOrg.orgId, orgId)
                    )
                )
                .limit(1);
            req.apiKeyOrg = apiKeyOrgRes[0];
        }

        if (!req.apiKeyOrg) {
            return next(
                createHttpError(
                    HttpCode.FORBIDDEN,
                    "Key does not have access to this organization"
                )
            );
        }

        req.aiProvider = provider;
        return next();
    } catch (error) {
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Error verifying AI provider access"
            )
        );
    }
}
