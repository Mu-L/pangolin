import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db, olms } from "@server/db";
import { clients } from "@server/db";
import { eq, and } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import stoi from "@server/lib/stoi";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";

const getClientSchema = z.strictObject({
    clientId: z
        .string()
        .optional()
        .transform(stoi)
        .pipe(z.int().positive().optional())
        .optional(),
    niceId: z.string().optional(),
    orgId: z.string().optional()
});

async function query(clientId?: number, niceId?: string, orgId?: string) {
    if (clientId) {
        const [res] = await db
            .select()
            .from(clients)
            .where(eq(clients.clientId, clientId))
            .leftJoin(olms, eq(clients.clientId, olms.clientId))
            .limit(1);
        return res;
    } else if (niceId && orgId) {
        const [res] = await db
            .select()
            .from(clients)
            .where(and(eq(clients.niceId, niceId), eq(clients.orgId, orgId)))
            .leftJoin(olms, eq(clients.clientId, olms.clientId))
            .limit(1);
        return res;
    }
}

export type GetClientResponse = NonNullable<
    Awaited<ReturnType<typeof query>>
>["clients"] & {
    olmId: string | null;
};

registry.registerPath({
    method: "get",
    path: "/org/{orgId}/client/{niceId}",
    description:
        "Get a client by orgId and niceId. NiceId is a readable ID for the site and unique on a per org basis.",
    tags: [OpenAPITags.Org, OpenAPITags.Site],
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
    path: "/client/{clientId}",
    description: "Get a client by its client ID.",
    tags: [OpenAPITags.Client],
    request: {
        params: z.object({
            clientId: z.number()
        })
    },
    responses: {}
});

export async function getClient(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = getClientSchema.safeParse(req.params);
        if (!parsedParams.success) {
            logger.error(
                `Error parsing params: ${fromError(parsedParams.error).toString()}`
            );
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { clientId, niceId, orgId } = parsedParams.data;

        const client = await query(clientId, niceId, orgId);

        if (!client) {
            return next(
                createHttpError(HttpCode.NOT_FOUND, "Client not found")
            );
        }

        const data: GetClientResponse = {
            ...client.clients,
            olmId: client.olms ? client.olms.olmId : null
        };

        return response<GetClientResponse>(res, {
            data,
            success: true,
            error: false,
            message: "Client retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
