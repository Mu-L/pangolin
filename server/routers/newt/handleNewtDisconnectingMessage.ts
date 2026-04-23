import { MessageHandler } from "@server/routers/ws";
import {
    db,
    Newt,
    sites,
    statusHistory,
    targetHealthCheck,
    targets
} from "@server/db";
import { eq } from "drizzle-orm";
import logger from "@server/logger";
import { fireSiteOfflineAlert } from "@server/lib/alerts";

/**
 * Handles disconnecting messages from sites to show disconnected in the ui
 */
export const handleNewtDisconnectingMessage: MessageHandler = async (
    context
) => {
    const { message, client: c, sendToClient } = context;
    const newt = c as Newt;

    if (!newt) {
        logger.warn("Newt not found");
        return;
    }

    if (!newt.siteId) {
        logger.warn("Newt has no client ID!");
        return;
    }

    try {
        // Update the client's last ping timestamp
        const [site] = await db
            .update(sites)
            .set({
                online: false
            })
            .where(eq(sites.siteId, newt.siteId))
            .returning();

        await fireSiteOfflineAlert(site.orgId, site.siteId, site.name);
    } catch (error) {
        logger.error("Error handling disconnecting message", { error });
    }
};
