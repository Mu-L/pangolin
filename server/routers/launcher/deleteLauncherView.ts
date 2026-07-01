import { db, launcherViews } from "@server/db";
import { response } from "@server/lib/response";
import { getFirstString } from "@server/lib/requestParams";
import HttpCode from "@server/types/HttpCode";
import { and, eq } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";
import createHttpError from "http-errors";
import {
    isOrgAdminOrOwner,
    verifyLauncherOrgMembership
} from "./launcherResourceAccess";

export async function deleteLauncherView(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const orgId = getFirstString(req.params.orgId);
        const viewId = Number.parseInt(
            getFirstString(req.params.viewId) ?? "",
            10
        );
        const userId = req.user?.userId;

        if (!userId) {
            return next(
                createHttpError(HttpCode.UNAUTHORIZED, "User not authenticated")
            );
        }

        if (!orgId || !Number.isFinite(viewId)) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "Invalid request parameters"
                )
            );
        }

        const { userRoleIds } = await verifyLauncherOrgMembership(
            orgId,
            userId
        );

        const [existing] = await db
            .select()
            .from(launcherViews)
            .where(
                and(
                    eq(launcherViews.viewId, viewId),
                    eq(launcherViews.orgId, orgId)
                )
            )
            .limit(1);

        if (!existing) {
            return next(
                createHttpError(HttpCode.NOT_FOUND, "Launcher view not found")
            );
        }

        const isPersonalView = existing.userId === userId;
        const isOrgWideView = existing.userId == null;
        const isAdmin = await isOrgAdminOrOwner(orgId, userId, userRoleIds);

        if (!isPersonalView && !(isOrgWideView && isAdmin)) {
            return next(
                createHttpError(
                    HttpCode.FORBIDDEN,
                    "You do not have permission to delete this view"
                )
            );
        }

        await db.delete(launcherViews).where(eq(launcherViews.viewId, viewId));

        return response(res, {
            data: null,
            success: true,
            error: false,
            message: "Launcher view deleted successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        if (createHttpError.isHttpError(error)) {
            return next(error);
        }
        console.error("Error deleting launcher view:", error);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Internal server error"
            )
        );
    }
}
