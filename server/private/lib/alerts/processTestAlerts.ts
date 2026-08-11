import { db, userOrgRoles, users } from "@server/db";
import logger from "@server/logger";
import type {
    EmailAlertAction,
    TestAlertContext,
    WebhookAlertConfig
} from "@server/routers/alertRule/types";
import { eq, inArray } from "drizzle-orm";
import { sendAlertEmail } from "./sendAlertEmail";
import { decrypt } from "@server/lib/crypto";
import config from "@server/lib/config";
import { sendAlertWebhook } from "./sendAlertWebhook";

export async function processTestAlerts(context: TestAlertContext) {
    const emailActions = context.actions.filter(
        (action) => action.type === "email"
    );
    // Process email actions
    for (const action of emailActions) {
        try {
            const recipients = await resolveEmailRecipients(action);
            if (recipients.length > 0) {
                await sendAlertEmail(recipients, {
                    ...context,
                    isTest: true
                });
            }
        } catch (err) {
            logger.error(`processTestAlerts: failed to send alert email`, err);
        }
    }

    const webhookActions = context.actions.filter(
        (action) => action.type === "webhook"
    );
    const serverSecret = config.getRawConfig().server.secret!;

    for (const action of webhookActions) {
        try {
            let webhookConfig: WebhookAlertConfig = { authType: "none" };

            if (action.config) {
                try {
                    const decrypted = decrypt(action.config, serverSecret);
                    webhookConfig = JSON.parse(decrypted) as WebhookAlertConfig;
                } catch (err) {
                    logger.error(
                        `processTestAlerts: failed to decrypt webhook`,
                        err
                    );
                    continue;
                }
            }

            await sendAlertWebhook(action.webhookUrl, webhookConfig, context);
        } catch (err) {
            logger.error(
                `processTestAlerts: failed to send alert webhook `,
                err
            );
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
    const emailList: string[] = [];

    emailList.push(...(action.emails ?? []));

    if (action.userIds && action.userIds?.length > 0) {
        const userList = await db
            .select({ email: users.email })
            .from(users)
            .where(inArray(users.userId, action.userIds));

        emailList.push(
            ...userList.filter((u) => u.email !== null).map((u) => u.email!)
        );
    }
    if (action.roleIds && action.roleIds?.length > 0) {
        const userList = await db
            .select({ email: users.email })
            .from(userOrgRoles)
            .innerJoin(users, eq(userOrgRoles.userId, users.userId))
            .where(inArray(userOrgRoles.roleId, action.roleIds.map(Number)));

        emailList.push(
            ...userList.filter((u) => u.email !== null).map((u) => u.email!)
        );
    }

    return [...new Set(emailList)];
}
