import { generateSessionToken } from "@server/auth/sessions/app";
import { db } from "@server/db";
import { orgs, resourcePincode, resourcePolicies, resourcePolicyPincode, resources } from "@server/db";
import HttpCode from "@server/types/HttpCode";
import response from "@server/lib/response";
import { eq } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";
import createHttpError from "http-errors";
import { z } from "zod";
import { fromError } from "zod-validation-error";
import { createResourceSession } from "@server/auth/sessions/resource";
import logger from "@server/logger";
import { verifyPassword } from "@server/auth/password";
import config from "@server/lib/config";
import { logAccessAudit } from "#dynamic/lib/logAccessAudit";

export const authWithPincodeBodySchema = z.strictObject({
    pincode: z.string()
});

export const authWithPincodeParamsSchema = z.strictObject({
    resourceId: z.coerce.number().int().positive()
});

export type AuthWithPincodeResponse = {
    session?: string;
};

export async function authWithPincode(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    const parsedBody = authWithPincodeBodySchema.safeParse(req.body);

    if (!parsedBody.success) {
        return next(
            createHttpError(
                HttpCode.BAD_REQUEST,
                fromError(parsedBody.error).toString()
            )
        );
    }

    const parsedParams = authWithPincodeParamsSchema.safeParse(req.params);

    if (!parsedParams.success) {
        return next(
            createHttpError(
                HttpCode.BAD_REQUEST,
                fromError(parsedParams.error).toString()
            )
        );
    }

    const { resourceId } = parsedParams.data;
    const { pincode } = parsedBody.data;

    try {
        const [result] = await db
            .select()
            .from(resources)
            .leftJoin(orgs, eq(orgs.orgId, resources.orgId))
            .leftJoin(
                resourcePolicies,
                eq(resourcePolicies.resourcePolicyId, resources.resourcePolicyId)
            )
            .leftJoin(
                resourcePolicyPincode,
                eq(resourcePolicyPincode.resourcePolicyId, resourcePolicies.resourcePolicyId)
            )
            .leftJoin(
                resourcePincode,
                eq(resourcePincode.resourceId, resources.resourceId)
            )
            .where(eq(resources.resourceId, resourceId))
            .limit(1);

        const resource = result?.resources;
        const org = result?.orgs;

        // Policy pincode takes precedence over resource-level pincode
        const policyPincode = result?.resourcePolicyPincode ?? null;
        const definedPincode = policyPincode ?? result?.resourcePincode ?? null;
        const isPolicyPincode = !!policyPincode;

        if (!org) {
            return next(
                createHttpError(
                    HttpCode.INTERNAL_SERVER_ERROR,
                    "Org does not exist"
                )
            );
        }

        if (!resource) {
            return next(
                createHttpError(HttpCode.BAD_REQUEST, "Resource does not exist")
            );
        }

        if (!definedPincode) {
            return next(
                createHttpError(
                    HttpCode.UNAUTHORIZED,
                    "Resource has no pincode protection"
                )
            );
        }

        const validPincode = await verifyPassword(
            pincode,
            definedPincode.pincodeHash
        );
        if (!validPincode) {
            if (config.getRawConfig().app.log_failed_attempts) {
                logger.info(
                    `Resource pin code incorrect. Resource ID: ${resource.resourceId}. IP: ${req.ip}.`
                );
            }

            logAccessAudit({
                orgId: org.orgId,
                resourceId: resource.resourceId,
                action: false,
                type: "pincode",
                userAgent: req.headers["user-agent"],
                requestIp: req.ip
            });

            return next(
                createHttpError(HttpCode.UNAUTHORIZED, "Incorrect PIN")
            );
        }

        const token = generateSessionToken();
        await createResourceSession({
            resourceId,
            token,
            pincodeId: isPolicyPincode ? null : definedPincode.pincodeId,
            policyPincodeId: isPolicyPincode ? definedPincode.pincodeId : null,
            isRequestToken: true,
            expiresAt: Date.now() + 1000 * 30, // 30 seconds
            sessionLength: 1000 * 30,
            doNotExtend: true
        });

        logAccessAudit({
            orgId: org.orgId,
            resourceId: resource.resourceId,
            action: true,
            type: "pincode",
            userAgent: req.headers["user-agent"],
            requestIp: req.ip
        });

        return response<AuthWithPincodeResponse>(res, {
            data: {
                session: token
            },
            success: true,
            error: false,
            message: "Authenticated with resource successfully",
            status: HttpCode.OK
        });
    } catch (e) {
        logger.error(e);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Failed to authenticate with resource"
            )
        );
    }
}
