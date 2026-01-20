import { Client, db, exitNodes, Olm, sites, clientSitesAssociationsCache } from "@server/db";
import { buildSiteConfigurationForOlmClient } from "./buildConfiguration";
import { sendToClient } from "#dynamic/routers/ws";
import logger from "@server/logger";
import { eq, inArray } from "drizzle-orm";
import config from "@server/lib/config";

export async function sendOlmSyncMessage(olm: Olm, client: Client) {
    // NOTE: WE ARE HARDCODING THE RELAY PARAMETER TO FALSE HERE BUT IN THE REGISTER MESSAGE ITS DEFINED BY THE CLIENT
    const siteConfigurations = await buildSiteConfigurationForOlmClient(
        client,
        client.pubKey,
        false
    );

    // Get all exit nodes from sites where the client has peers
    const clientSites = await db
        .select()
        .from(clientSitesAssociationsCache)
        .innerJoin(
            sites,
            eq(sites.siteId, clientSitesAssociationsCache.siteId)
        )
        .where(eq(clientSitesAssociationsCache.clientId, client.clientId));

    // Extract unique exit node IDs
    const exitNodeIds = Array.from(
        new Set(
            clientSites
                .map(({ sites: site }) => site.exitNodeId)
                .filter((id): id is number => id !== null)
        )
    );

    let exitNodesData: {
        publicKey: string;
        relayPort: number;
        endpoint: string;
        siteIds: number[];
    }[] = [];

    if (exitNodeIds.length > 0) {
        const allExitNodes = await db
            .select()
            .from(exitNodes)
            .where(inArray(exitNodes.exitNodeId, exitNodeIds));

        // Map exitNodeId to siteIds
        const exitNodeIdToSiteIds: Record<number, number[]> = {};
        for (const { sites: site } of clientSites) {
            if (site.exitNodeId !== null) {
                if (!exitNodeIdToSiteIds[site.exitNodeId]) {
                    exitNodeIdToSiteIds[site.exitNodeId] = [];
                }
                exitNodeIdToSiteIds[site.exitNodeId].push(site.siteId);
            }
        }

        exitNodesData = allExitNodes.map((exitNode) => {
            return {
                publicKey: exitNode.publicKey,
                relayPort: config.getRawConfig().gerbil.clients_start_port,
                endpoint: exitNode.endpoint,
                siteIds: exitNodeIdToSiteIds[exitNode.exitNodeId] ?? []
            };
        });
    }

    logger.debug("sendOlmSyncMessage: sending sync message");

    await sendToClient(olm.olmId, {
        type: "olm/sync",
        data: {
            sites: siteConfigurations,
            exitNodes: exitNodesData
        }
    }).catch((error) => {
        logger.warn(`Error sending olm sync message:`, error);
    });
}
