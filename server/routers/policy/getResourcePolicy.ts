import { db, resourcePolicies, rolePolicies, userPolicies } from "@server/db";
import response from "@server/lib/response";
import logger from "@server/logger";
import { OpenAPITags, registry } from "@server/openApi";
import HttpCode from "@server/types/HttpCode";
import { and, eq, type SQL } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import createHttpError from "http-errors";
import z from "zod";
import { fromError } from "zod-validation-error";

const getResourcePolicySchema = z
    .strictObject({
        niceId: z.string(),
        orgId: z.string()
    })
    .or(
        z.strictObject({
            resourcePolicyId: z.coerce.number<string>().int().positive()
        })
    );

async function query(params: z.infer<typeof getResourcePolicySchema>) {
    const conditions: SQL<unknown>[] = [];
    if ("resourcePolicyId" in params) {
        conditions.push(
            eq(resourcePolicies.resourcePolicyId, params.resourcePolicyId)
        );
    } else {
        conditions.push(
            eq(resourcePolicies.niceId, params.niceId),
            eq(resourcePolicies.orgId, params.orgId)
        );
    }

    const [res] = await db
        .select({
            policy: resourcePolicies,
            userPolicies,
            rolePolicies
        })
        .from(resourcePolicies)
        .leftJoin(
            userPolicies,
            eq(userPolicies.resourcePolicyId, resourcePolicies.resourcePolicyId)
        )
        .leftJoin(
            rolePolicies,
            eq(rolePolicies.resourcePolicyId, resourcePolicies.resourcePolicyId)
        )
        .where(and(...conditions))
        .limit(1);
    return res;
}

export type GetResourcePolicyResponse = Awaited<ReturnType<typeof query>>;

registry.registerPath({
    method: "get",
    path: "/org/{orgId}/resource-policy/{niceId}",
    description:
        "Get a resource policy by orgId and niceId. NiceId is a readable ID for the resource and unique on a per org basis.",
    tags: [OpenAPITags.Org, OpenAPITags.Policy],
    request: {
        params: z.object({
            orgId: z.string(),
            niceId: z.string()
        })
    },
    responses: {}
});

registry.registerPath({
    method: "get",
    path: "/resource-policy/{resourcePolicyId}",
    description: "Get a resource policy by its resourcePolicyId.",
    tags: [OpenAPITags.Policy],
    request: {
        params: z.object({
            resourcePolicyId: z.number()
        })
    },
    responses: {}
});

export async function getResourcePolicy(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = getResourcePolicySchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const policy = await query(parsedParams.data);

        if (!policy) {
            return next(
                createHttpError(HttpCode.NOT_FOUND, "Resource policy not found")
            );
        }

        return response<GetResourcePolicyResponse>(res, {
            data: policy,
            success: true,
            error: false,
            message: "Resource Policy retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
