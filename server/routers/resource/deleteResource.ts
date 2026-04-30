import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db, targetHealthCheck } from "@server/db";
import { newts, resources, sites, targets } from "@server/db";
import { eq, inArray } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { addPeer } from "../gerbil/peers";
import { removeTargets } from "../newt/targets";
import { getAllowedIps } from "../target/helpers";
import { OpenAPITags, registry } from "@server/openApi";

// Define Zod schema for request parameters validation
const deleteResourceSchema = z.strictObject({
    resourceId: z.string().transform(Number).pipe(z.int().positive())
});

registry.registerPath({
    method: "delete",
    path: "/resource/{resourceId}",
    description: "Delete a resource.",
    tags: [OpenAPITags.PublicResource],
    request: {
        params: deleteResourceSchema
    },
    responses: {}
});

export async function deleteResource(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = deleteResourceSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { resourceId } = parsedParams.data;

        const targetsToBeRemoved = await db
            .select()
            .from(targets)
            .where(eq(targets.resourceId, resourceId));

        const healthChecksToBeRemoved = await db
            .select()
            .from(targetHealthCheck)
            .where(
                inArray(
                    targetHealthCheck.targetId,
                    targetsToBeRemoved.map((t) => t.targetId)
                )
            );

        const [deletedResource] = await db
            .delete(resources)
            .where(eq(resources.resourceId, resourceId))
            .returning();

        if (!deletedResource) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Resource with ID ${resourceId} not found`
                )
            );
        }

        for (const target of targetsToBeRemoved) {
            const [site] = await db
                .select()
                .from(sites)
                .where(eq(sites.siteId, target.siteId))
                .limit(1);

            if (!site) {
                return next(
                    createHttpError(
                        HttpCode.NOT_FOUND,
                        `Site with ID ${target.siteId} not found`
                    )
                );
            }

            if (site.pubKey) {
                if (site.type == "newt") {
                    // get the newt on the site by querying the newt table for siteId
                    const [newt] = await db
                        .select()
                        .from(newts)
                        .where(eq(newts.siteId, site.siteId))
                        .limit(1);

                    await removeTargets(
                        newt.newtId,
                        // [target],
                        [], // deleting the target from newt causes issues because we cant unbind the port. this needs to be fixed in newt before we can do this
                        healthChecksToBeRemoved,
                        deletedResource.protocol,
                        newt.version
                    );
                }
            }
        }

        return response(res, {
            data: null,
            success: true,
            error: false,
            message: "Resource deleted successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
