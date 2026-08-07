import logger from "@server/logger";
import type {
    EmailAlertAction,
    TestAlertContext
} from "@server/routers/alertRule/types";
import { sendAlertEmail } from "./sendAlertEmail";
import type { db, alertEmailRecipients, users, userOrgRoles } from "@server/db";
import type { eq } from "drizzle-orm";

export async function processTestAlerts(context: TestAlertContext) {
    const emailActions = context.actions.filter(
        (action) => action.type === "email"
    );
    // Process email actions
    for (const action of emailActions) {
        try {
            const recipients = await resolveEmailRecipients(action);
            if (recipients.length > 0) {
                await sendAlertEmail(recipients, context);
            }
        } catch (err) {
            logger.error(`processAlerts: failed to send alert email`, err);
        }
    }
}

/**
 * Resolves all email addresses for a given `emailActionId`.
 *
 * Recipients may be:
 * - Direct users (by `userId`)
 * - All users in a role (by `roleId`, resolved via `userOrgRoles`)
 * - Direct external email addresses
 */
async function resolveEmailRecipients(
    action: EmailAlertAction
): Promise<string[]> {
    const emailSet = new Set<string>();

    // for (const row of rows) {
    //     if (row.email) {
    //         emailSet.add(row.email);
    //     }

    //     if (row.userId) {
    //         const [user] = await db
    //             .select({ email: users.email })
    //             .from(users)
    //             .where(eq(users.userId, row.userId))
    //             .limit(1);
    //         if (user?.email) {
    //             emailSet.add(user.email);
    //         }
    //     }

    //     if (row.roleId) {
    //         // Find all users with this role via userOrgRoles
    //         const roleUsers = await db
    //             .select({ email: users.email })
    //             .from(userOrgRoles)
    //             .innerJoin(users, eq(userOrgRoles.userId, users.userId))
    //             .where(eq(userOrgRoles.roleId, Number(row.roleId)));

    //         for (const u of roleUsers) {
    //             if (u.email) {
    //                 emailSet.add(u.email);
    //             }
    //         }
    //     }
    // }

    return Array.from(emailSet);
}
