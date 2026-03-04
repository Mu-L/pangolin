import { Request, Response, NextFunction } from "express";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { generateId } from "@server/auth/sessions/app";
import { getNextAvailableClientSubnet } from "@server/lib/ip";
import { z } from "zod";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";

export type PickClientDefaultsResponse = {
    olmId: string;
    olmSecret: string;
    subnet: string;
};

const pickClientDefaultsSchema = z.strictObject({
    orgId: z.string()
});

registry.registerPath({
    method: "get",
    path: "/org/{orgId}/pick-client-defaults",
    description: "Return pre-requisite data for creating a client.",
    tags: [OpenAPITags.Client],
    request: {
        params: pickClientDefaultsSchema
    },
    responses: {}
});

export async function pickClientDefaults(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = pickClientDefaultsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { orgId } = parsedParams.data;

        const olmId = generateId(15);
        const secret = generateId(48);

        const newSubnet = await getNextAvailableClientSubnet(orgId);
        if (!newSubnet) {
            return next(
                createHttpError(
                    HttpCode.INTERNAL_SERVER_ERROR,
                    "No available subnet found"
                )
            );
        }

        const subnet = newSubnet.split("/")[0];

        return response<PickClientDefaultsResponse>(res, {
            data: {
                olmId: olmId,
                olmSecret: secret,
                subnet: subnet
            },
            success: true,
            error: false,
            message: "Organization retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
