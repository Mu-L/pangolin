import { NextFunction, Request, Response } from "express";
import { db } from "@server/db";
import { olms } from "@server/db";
import { eq } from "drizzle-orm";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import response from "@server/lib/response";
import { z } from "zod";
import { fromError } from "zod-validation-error";
import logger from "@server/logger";

const paramsSchema = z
    .object({
        userId: z.string(),
        olmId: z.string()
    })
    .strict();

export async function unarchiveUserOlm(
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

        // Check if OLM exists and is archived
        const [olm] = await db
            .select()
            .from(olms)
            .where(eq(olms.olmId, olmId))
            .limit(1);

        if (!olm) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `OLM with ID ${olmId} not found`
                )
            );
        }

        if (!olm.archived) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    `OLM with ID ${olmId} is not archived`
                )
            );
        }

        // Unarchive the OLM (set archived to false)
        await db
            .update(olms)
            .set({ archived: false })
            .where(eq(olms.olmId, olmId));

        return response(res, {
            data: null,
            success: true,
            error: false,
            message: "Device unarchived successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Failed to unarchive device"
            )
        );
    }
}
