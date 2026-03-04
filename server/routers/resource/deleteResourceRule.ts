import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import { resourceRules, resources } from "@server/db";
import { eq } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";

const deleteResourceRuleSchema = z.strictObject({
    ruleId: z.string().transform(Number).pipe(z.int().positive()),
    resourceId: z.string().transform(Number).pipe(z.int().positive())
});

registry.registerPath({
    method: "delete",
    path: "/resource/{resourceId}/rule/{ruleId}",
    description: "Delete a resource rule.",
    tags: [OpenAPITags.PublicResource, OpenAPITags.Rule],
    request: {
        params: deleteResourceRuleSchema
    },
    responses: {}
});

export async function deleteResourceRule(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = deleteResourceRuleSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { ruleId } = parsedParams.data;

        // Delete the rule and return the deleted record
        const [deletedRule] = await db
            .delete(resourceRules)
            .where(eq(resourceRules.ruleId, ruleId))
            .returning();

        if (!deletedRule) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Resource rule with ID ${ruleId} not found`
                )
            );
        }

        return response(res, {
            data: null,
            success: true,
            error: false,
            message: "Resource rule deleted successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
