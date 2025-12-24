import { Client, Olm } from "@server/db";
import { buildSiteConfigurationForOlmClient } from "./buildSiteConfigurationForOlmClient";

export async function sendOlmSyncMessage(olm: Olm, client: Client) {
    const siteConfigurations = await buildSiteConfigurationForOlmClient(client, publicKey, relay);

}
