import { Response, NextFunction } from "express";
import { db } from "@server/db";
import { users } from "@server/db";
import { eq, or } from "drizzle-orm";
import createHttpError from "http-errors";
import HttpCode from "@server/types/HttpCode";
import { verifySession } from "@server/auth/sessions/verifySession";
import { getUserOrgRoleIds } from "@server/lib/userOrgRoles";

/**
 * Middleware that populates req.user from either:
 *  1. A valid session cookie (normal authenticated flow), or
 *  2. Badger-injected headers: Remote-User-Id, Remote-User (username), Remote-Email
 *
 * If an orgId is present in req.params, req.userOrgRoleIds is also populated.
 *
 * If neither source yields a user, returns 401.
 * If header-based lookup matches more than one user, returns 400.
 */
export const verifyUserFromSessionOrHeadersMiddleware = async (
    req: any,
    res: Response,
    next: NextFunction
) => {
    // 1. Try session-based auth first
    if (!req.user) {
        try {
            const { session, user } = await verifySession(req);
            if (session && user) {
                const rows = await db
                    .select()
                    .from(users)
                    .where(eq(users.userId, user.userId));

                if (rows[0]) {
                    req.user = rows[0];
                    req.session = session;
                }
            }
        } catch {
            // session lookup failure is not fatal; fall through to header auth
        }
    }

    // 2. Fall back to Badger-injected headers
    if (!req.user) {
        const userId = req.headers["remote-user-id"] as string | undefined;
        const username = req.headers["remote-user"] as string | undefined;
        const email = req.headers["remote-email"] as string | undefined;

        if (!userId && !username && !email) {
            return next(
                createHttpError(HttpCode.UNAUTHORIZED, "User not authenticated")
            );
        }

        let foundUsers;

        if (userId) {
            // Most reliable: look up directly by ID
            foundUsers = await db
                .select()
                .from(users)
                .where(eq(users.userId, userId));
        } else {
            // Fall back to username / email (may be absent depending on badger version)
            const conditions = [];
            if (username) conditions.push(eq(users.username, username));
            if (email) conditions.push(eq(users.email, email));

            foundUsers = await db
                .select()
                .from(users)
                .where(or(...conditions));
        }

        if (!foundUsers || foundUsers.length === 0) {
            return next(
                createHttpError(HttpCode.UNAUTHORIZED, "User not found")
            );
        }

        if (foundUsers.length > 1) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "Multiple users found matching the provided credentials"
                )
            );
        }

        req.user = foundUsers[0];
    }

    // 3. Populate userOrgRoleIds if an orgId is available in route params
    if (req.user && req.params?.orgId && !req.userOrgRoleIds) {
        req.userOrgRoleIds = await getUserOrgRoleIds(
            req.user.userId,
            req.params.orgId
        );
    }

    next();
};
