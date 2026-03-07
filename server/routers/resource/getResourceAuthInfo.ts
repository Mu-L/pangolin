import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
    db,
    resourcePolicies,
    resourcePolicyHeaderAuth,
    resourcePolicyPassword,
    resourcePolicyPincode,
    resources
} from "@server/db";
import { eq, or } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import { fromError } from "zod-validation-error";
import logger from "@server/logger";
import { build } from "@server/build";

const getResourceAuthInfoSchema = z.strictObject({
    resourceGuid: z.string()
});

export type GetResourceAuthInfoResponse = {
    resourceId: number;
    resourceGuid: string;
    resourceName: string;
    niceId: string;
    password: boolean;
    pincode: boolean;
    headerAuth: boolean;
    headerAuthExtendedCompatibility: boolean;
    sso: boolean;
    blockAccess: boolean;
    url: string;
    whitelist: boolean;
    skipToIdpId: number | null;
    orgId: string;
    postAuthPath: string | null;
};

export async function getResourceAuthInfo(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = getResourceAuthInfoSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { resourceGuid } = parsedParams.data;

        const isGuidInteger = /^\d+$/.test(resourceGuid);

        const buildQuery = (whereClause: ReturnType<typeof eq>) =>
            db
                .select()
                .from(resources)
                .leftJoin(
                    resourcePolicies,
                    or(
                        eq(
                            resourcePolicies.resourcePolicyId,
                            resources.resourcePolicyId
                        ),
                        eq(
                            resourcePolicies.resourcePolicyId,
                            resources.defaultResourcePolicyId
                        )
                    )
                )
                .leftJoin(
                    resourcePolicyPincode,
                    eq(
                        resourcePolicyPincode.resourcePolicyId,
                        resourcePolicies.resourcePolicyId
                    )
                )
                .leftJoin(
                    resourcePolicyPassword,
                    eq(
                        resourcePolicyPassword.resourcePolicyId,
                        resourcePolicies.resourcePolicyId
                    )
                )
                .leftJoin(
                    resourcePolicyHeaderAuth,
                    eq(
                        resourcePolicyHeaderAuth.resourcePolicyId,
                        resourcePolicies.resourcePolicyId
                    )
                )
                .where(whereClause)
                .limit(1);

        const [result] =
            isGuidInteger && build === "saas"
                ? await buildQuery(
                      eq(resources.resourceId, Number(resourceGuid))
                  )
                : await buildQuery(eq(resources.resourceGuid, resourceGuid));

        const resource = result?.resources;
        if (!resource) {
            return next(
                createHttpError(HttpCode.NOT_FOUND, "Resource not found")
            );
        }

        const policy = result?.resourcePolicies;
        const pincode = result?.resourcePolicyPincode;
        const password = result?.resourcePolicyPassword;
        const headerAuth = result?.resourcePolicyHeaderAuth;

        const url = `${resource.ssl ? "https" : "http"}://${resource.fullDomain}`;

        return response<GetResourceAuthInfoResponse>(res, {
            data: {
                niceId: resource.niceId,
                resourceGuid: resource.resourceGuid,
                resourceId: resource.resourceId,
                resourceName: resource.name,
                password: password !== null,
                pincode: pincode !== null,
                headerAuth: headerAuth !== null,
                headerAuthExtendedCompatibility:
                    headerAuth?.extendedCompatibility ?? false,
                sso: policy?.sso ?? false,
                blockAccess: resource.blockAccess,
                url,
                whitelist: policy?.emailWhitelistEnabled ?? false,
                skipToIdpId: resource.skipToIdpId,
                orgId: resource.orgId,
                postAuthPath: resource.postAuthPath ?? null
            },
            success: true,
            error: false,
            message: "Resource auth info retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
