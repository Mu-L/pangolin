import { NextFunction, Request, Response } from "express";
import { db } from "@server/db";
import { olms, clients } from "@server/db";
import { eq } from "drizzle-orm";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import response from "@server/lib/response";
import { z } from "zod";
import { fromError } from "zod-validation-error";
import logger from "@server/logger";
import { OpenAPITags, registry } from "@server/openApi";
import { rebuildClientAssociationsFromClient } from "@server/lib/rebuildClientAssociations";
import { sendTerminateClient } from "../client/terminate";

const paramsSchema = z
    .object({
        userId: z.string(),
        olmId: z.string()
    })
    .strict();

// registry.registerPath({
//     method: "post",
//     path: "/user/{userId}/olm/{olmId}/archive",
//     description: "Archive an olm for a user.",
//     tags: [OpenAPITags.User, OpenAPITags.Client],
//     request: {
//         params: paramsSchema
//     },
//     responses: {}
// });

export async function archiveUserOlm(
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

        const { olmId } = parsedParams.data;

        // Archive the OLM and disconnect associated clients in a transaction
        await db.transaction(async (trx) => {
            // Find all clients associated with this OLM
            const associatedClients = await trx
                .select()
                .from(clients)
                .where(eq(clients.olmId, olmId));

            // Disconnect clients from the OLM (set olmId to null)
            for (const client of associatedClients) {
                await trx
                    .update(clients)
                    .set({ olmId: null })
                    .where(eq(clients.clientId, client.clientId));

                await rebuildClientAssociationsFromClient(client, trx);
                await sendTerminateClient(client.clientId, olmId);
            }

            // Archive the OLM (set archived to true)
            await trx
                .update(olms)
                .set({ archived: true })
                .where(eq(olms.olmId, olmId));
        });

        return response(res, {
            data: null,
            success: true,
            error: false,
            message: "Device archived successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Failed to archive device"
            )
        );
    }
}
