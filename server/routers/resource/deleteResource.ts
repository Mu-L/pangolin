import { db, resourcePolicies, resources, targets } from "@server/db";
import response from "@server/lib/response";
import logger from "@server/logger";
import { OpenAPITags, registry } from "@server/openApi";
import HttpCode from "@server/types/HttpCode";
import { eq } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";
import createHttpError from "http-errors";
import { z } from "zod";
import { fromError } from "zod-validation-error";

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

        // Also delete default resource policy
        if (deletedResource.defaultResourcePolicyId) {
            await db
                .delete(resourcePolicies)
                .where(
                    eq(
                        resourcePolicies.resourcePolicyId,
                        deletedResource.defaultResourcePolicyId
                    )
                );
        }

        // const [site] = await db
        //     .select()
        //     .from(sites)
        //     .where(eq(sites.siteId, deletedResource.siteId!))
        //     .limit(1);
        //
        // if (!site) {
        //     return next(
        //         createHttpError(
        //             HttpCode.NOT_FOUND,
        //             `Site with ID ${deletedResource.siteId} not found`
        //         )
        //     );
        // }
        //
        // if (site.pubKey) {
        //     if (site.type == "wireguard") {
        //         await addPeer(site.exitNodeId!, {
        //             publicKey: site.pubKey,
        //             allowedIps: await getAllowedIps(site.siteId)
        //         });
        //     } else if (site.type == "newt") {
        //         // get the newt on the site by querying the newt table for siteId
        //         const [newt] = await db
        //             .select()
        //             .from(newts)
        //             .where(eq(newts.siteId, site.siteId))
        //             .limit(1);
        //
        //         removeTargets(
        //             newt.newtId,
        //             targetsToBeRemoved,
        //             deletedResource.protocol,
        //             deletedResource.proxyPort
        //         );
        //     }
        // }
        //
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
