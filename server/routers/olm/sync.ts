import { Client, Olm } from "@server/db";
import { buildSiteConfigurationForOlmClient } from "./buildConfiguration";
import { sendToClient } from "#dynamic/routers/ws";
import logger from "@server/logger";

export async function sendOlmSyncMessage(olm: Olm, client: Client) {
    // NOTE: WE ARE HARDCODING THE RELAY PARAMETER TO FALSE HERE BUT IN THE REGISTER MESSAGE ITS DEFINED BY THE CLIENT
    const siteConfigurations = await buildSiteConfigurationForOlmClient(
        client,
        client.pubKey,
        false
    );

    await sendToClient(olm.olmId, {
        type: "olm/sync",
        data: {
            sites: siteConfigurations
        }
    }).catch((error) => {
        logger.warn(`Error sending olm sync message:`, error);
    });
}
