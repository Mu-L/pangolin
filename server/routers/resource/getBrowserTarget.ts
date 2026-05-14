import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import { resources, targets } from "@server/db";
import { eq } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import { fromError } from "zod-validation-error";
import logger from "@server/logger";

const getBrowserTargetSchema = z
    .object({
        fullDomain: z.string().min(1, "fullDomain is required")
    })
    .strict();

export type GetBrowserTargetResponse = {
    ip: string;
    port: number;
};

export async function getBrowserTarget(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsed = getBrowserTargetSchema.safeParse(req.query);
        if (!parsed.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsed.error).toString()
                )
            );
        }

        const { fullDomain } = parsed.data;

        const [row] = await db
            .select({
                ip: targets.ip,
                port: targets.port
            })
            .from(targets)
            .innerJoin(resources, eq(targets.resourceId, resources.resourceId))
            .where(eq(resources.fullDomain, fullDomain))
            .limit(1);

        if (!row) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    "No resource found for this domain"
                )
            );
        }

        return response<GetBrowserTargetResponse>(res, {
            data: { ip: row.ip, port: row.port },
            success: true,
            error: false,
            message: "Browser target retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "An error occurred while retrieving the browser target"
            )
        );
    }
}
