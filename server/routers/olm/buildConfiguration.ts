import { Client, clientSiteResourcesAssociationsCache, clientSitesAssociationsCache, db, exitNodes, siteResources, sites } from "@server/db";
import { generateAliasConfig, generateRemoteSubnets } from "@server/lib/ip";
import logger from "@server/logger";
import { and, eq } from "drizzle-orm";
import { addPeer, deletePeer } from "../newt/peers";
import config from "@server/lib/config";

export async function buildSiteConfigurationForOlmClient(
    client: Client,
    publicKey: string | null,
    relay: boolean
) {
    const siteConfigurations = [];

    // Get all sites data
    const sitesData = await db
        .select()
        .from(sites)
        .innerJoin(
            clientSitesAssociationsCache,
            eq(sites.siteId, clientSitesAssociationsCache.siteId)
        )
        .where(eq(clientSitesAssociationsCache.clientId, client.clientId));

    // Process each site
    for (const {
        sites: site,
        clientSitesAssociationsCache: association
    } of sitesData) {
        if (!site.exitNodeId) {
            logger.warn(
                `Site ${site.siteId} does not have exit node, skipping`
            );
            continue;
        }

        // Validate endpoint and hole punch status
        if (!site.endpoint) {
            logger.warn(
                `In olm register: site ${site.siteId} has no endpoint, skipping`
            );
            continue;
        }

        // if (site.lastHolePunch && now - site.lastHolePunch > 6 && relay) {
        //     logger.warn(
        //         `Site ${site.siteId} last hole punch is too old, skipping`
        //     );
        //     continue;
        // }

        // If public key changed, delete old peer from this site
        if (client.pubKey && client.pubKey != publicKey) {
            logger.info(
                `Public key mismatch. Deleting old peer from site ${site.siteId}...`
            );
            await deletePeer(site.siteId, client.pubKey!);
        }

        if (!site.subnet) {
            logger.warn(`Site ${site.siteId} has no subnet, skipping`);
            continue;
        }

        const [clientSite] = await db
            .select()
            .from(clientSitesAssociationsCache)
            .where(
                and(
                    eq(clientSitesAssociationsCache.clientId, client.clientId),
                    eq(clientSitesAssociationsCache.siteId, site.siteId)
                )
            )
            .limit(1);

        // Add the peer to the exit node for this site
        if (clientSite.endpoint && publicKey) {
            logger.info(
                `Adding peer ${publicKey} to site ${site.siteId} with endpoint ${clientSite.endpoint}`
            );
            await addPeer(site.siteId, {
                publicKey: publicKey,
                allowedIps: [`${client.subnet.split("/")[0]}/32`], // we want to only allow from that client
                endpoint: relay ? "" : clientSite.endpoint
            });
        } else {
            logger.warn(
                `Client ${client.clientId} has no endpoint, skipping peer addition`
            );
        }

        let relayEndpoint: string | undefined = undefined;
        if (relay) {
            const [exitNode] = await db
                .select()
                .from(exitNodes)
                .where(eq(exitNodes.exitNodeId, site.exitNodeId))
                .limit(1);
            if (!exitNode) {
                logger.warn(`Exit node not found for site ${site.siteId}`);
                continue;
            }
            relayEndpoint = `${exitNode.endpoint}:${config.getRawConfig().gerbil.clients_start_port}`;
        }

        const allSiteResources = await db // only get the site resources that this client has access to
            .select()
            .from(siteResources)
            .innerJoin(
                clientSiteResourcesAssociationsCache,
                eq(
                    siteResources.siteResourceId,
                    clientSiteResourcesAssociationsCache.siteResourceId
                )
            )
            .where(
                and(
                    eq(siteResources.siteId, site.siteId),
                    eq(
                        clientSiteResourcesAssociationsCache.clientId,
                        client.clientId
                    )
                )
            );

        // Add site configuration to the array
        siteConfigurations.push({
            siteId: site.siteId,
            name: site.name,
            // relayEndpoint: relayEndpoint, // this can be undefined now if not relayed // lets not do this for now because it would conflict with the hole punch testing
            endpoint: site.endpoint,
            publicKey: site.publicKey,
            serverIP: site.address,
            serverPort: site.listenPort,
            remoteSubnets: generateRemoteSubnets(
                allSiteResources.map(({ siteResources }) => siteResources)
            ),
            aliases: generateAliasConfig(
                allSiteResources.map(({ siteResources }) => siteResources)
            )
        });
    }

    return siteConfigurations;
}
