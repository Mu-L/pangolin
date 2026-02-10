import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db, UserOrg } from "@server/db";
import { roles, userInvites, userOrgs, users } from "@server/db";
import { eq } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { checkValidInvite } from "@server/auth/checkValidInvite";
import { verifySession } from "@server/auth/sessions/verifySession";
import { usageService } from "@server/lib/billing/usageService";
import { FeatureId } from "@server/lib/billing";
import { calculateUserClientsForOrgs } from "@server/lib/calculateUserClientsForOrgs";
import { build } from "@server/build";

const acceptInviteBodySchema = z.strictObject({
    token: z.string(),
    inviteId: z.string()
});

export type AcceptInviteResponse = {
    accepted: boolean;
    orgId: string;
};

export async function acceptInvite(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedBody = acceptInviteBodySchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { token, inviteId } = parsedBody.data;

        const { error, existingInvite } = await checkValidInvite({
            token,
            inviteId
        });

        if (error) {
            return next(createHttpError(HttpCode.BAD_REQUEST, error));
        }

        if (!existingInvite) {
            return next(
                createHttpError(HttpCode.BAD_REQUEST, "Invite does not exist")
            );
        }

        const existingUser = await db
            .select()
            .from(users)
            .where(eq(users.email, existingInvite.email))
            .limit(1);
        if (!existingUser.length) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "User does not exist. Please create an account first."
                )
            );
        }

        const { user, session } = await verifySession(req);

        // at this point we know the user exists
        if (!user) {
            return next(
                createHttpError(
                    HttpCode.UNAUTHORIZED,
                    "You must be logged in to accept an invite"
                )
            );
        }

        if (user && user.email !== existingInvite.email) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "Invite is not for this user"
                )
            );
        }

        if (build == "saas") {
            const usage = await usageService.getUsage(
                existingInvite.orgId,
                FeatureId.USERS
            );
            if (!usage) {
                return next(
                    createHttpError(
                        HttpCode.NOT_FOUND,
                        "No usage data found for this organization"
                    )
                );
            }
            const rejectUsers = await usageService.checkLimitSet(
                existingInvite.orgId,

                FeatureId.USERS,
                {
                    ...usage,
                    instantaneousValue: (usage.instantaneousValue || 0) + 1
                } // We need to add one to know if we are violating the limit
            );
            if (rejectUsers) {
                return next(
                    createHttpError(
                        HttpCode.FORBIDDEN,
                        "Can not accept because this org's user limit is exceeded. Please contact your administrator to upgrade their plan."
                    )
                );
            }
        }

        let roleId: number;
        let totalUsers: UserOrg[] | undefined;
        // get the role to make sure it exists
        const existingRole = await db
            .select()
            .from(roles)
            .where(eq(roles.roleId, existingInvite.roleId))
            .limit(1);
        if (existingRole.length) {
            roleId = existingRole[0].roleId;
        } else {
            // TODO: use the default role on the org instead of failing
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "Role does not exist. Please contact an admin."
                )
            );
        }

        await db.transaction(async (trx) => {
            // add the user to the org
            await trx.insert(userOrgs).values({
                userId: existingUser[0].userId,
                orgId: existingInvite.orgId,
                roleId: existingInvite.roleId
            });

            // delete the invite
            await trx
                .delete(userInvites)
                .where(eq(userInvites.inviteId, inviteId));

            await calculateUserClientsForOrgs(existingUser[0].userId, trx);

            // Get the total number of users in the org now
            totalUsers = await trx
                .select()
                .from(userOrgs)
                .where(eq(userOrgs.orgId, existingInvite.orgId));

            logger.debug(
                `User ${existingUser[0].userId} accepted invite to org ${existingInvite.orgId}. Total users in org: ${totalUsers.length}`
            );
        });

        if (totalUsers) {
            await usageService.updateCount(
                existingInvite.orgId,
                FeatureId.USERS,
                totalUsers.length
            );
        }

        return response<AcceptInviteResponse>(res, {
            data: { accepted: true, orgId: existingInvite.orgId },
            success: true,
            error: false,
            message: "Invite accepted",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
