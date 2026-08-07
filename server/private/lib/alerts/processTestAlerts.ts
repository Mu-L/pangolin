import logger from "@server/logger";
import type { TestAlertContext } from "@server/routers/alertRule/types";
import { sendAlertEmail } from "./sendAlertEmail";

export async function processTestAlerts(context: TestAlertContext) {
    const emailActions = context.actions.filter(
        (action) => action.type === "email"
    );
    // Process email actions
    for (const action of emailActions) {
        try {
            const recipients = await resolveEmailRecipients(
                action.emailActionId
            );
            if (recipients.length > 0) {
                await sendAlertEmail(recipients, context);
            }
        } catch (err) {
            logger.error(`processAlerts: failed to send alert email`, err);
        }
    }
}
