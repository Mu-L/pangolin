import { z } from "zod";
import { MessageHandler } from "@server/routers/ws";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import {
    db,
    ExitNode,
    exitNodes,
    siteResources,
    clientSiteResourcesAssociationsCache,
    Site
} from "@server/db";
import { clients, clientSitesAssociationsCache, Newt, sites } from "@server/db";
import { eq } from "drizzle-orm";
import { initPeerAddHandshake, updatePeer } from "../olm/peers";
import { sendToExitNode } from "#dynamic/lib/exitNodes";
import { generateSubnetProxyTargets, SubnetProxyTarget } from "@server/lib/ip";
import config from "@server/lib/config";

const inputSchema = z.object({
    publicKey: z.string(),
    port: z.int().positive()
});

type Input = z.infer<typeof inputSchema>;

export const handleGetConfigMessage: MessageHandler = async (context) => {
    const { message, client, sendToClient } = context;
    const newt = client as Newt;

    const now = new Date().getTime() / 1000;

    logger.debug("Handling Newt get config message!");

    if (!newt) {
        logger.warn("Newt not found");
        return;
    }

    if (!newt.siteId) {
        logger.warn("Newt has no site!"); // TODO: Maybe we create the site here?
        return;
    }

    const parsed = inputSchema.safeParse(message.data);
    if (!parsed.success) {
        logger.error(
            "handleGetConfigMessage: Invalid input: " +
                fromError(parsed.error).toString()
        );
        return;
    }

    const { publicKey, port } = message.data as Input;
    const siteId = newt.siteId;

    // Get the current site data
    const [existingSite] = await db
        .select()
        .from(sites)
        .where(eq(sites.siteId, siteId));

    if (!existingSite) {
        logger.warn("handleGetConfigMessage: Site not found");
        return;
    }

    // we need to wait for hole punch success
    if (!existingSite.endpoint) {
        logger.debug(
            `In newt get config: existing site ${existingSite.siteId} has no endpoint, skipping`
        );
        return;
    }

    if (existingSite.publicKey !== publicKey) {
        // TODO: somehow we should make sure a recent hole punch has happened if this occurs (hole punch could be from the last restart if done quickly)
    }

    if (existingSite.lastHolePunch && now - existingSite.lastHolePunch > 5) {
        logger.warn(
            `handleGetConfigMessage: Site ${existingSite.siteId} last hole punch is too old, skipping`
        );
        return;
    }

    // update the endpoint and the public key
    const [site] = await db
        .update(sites)
        .set({
            publicKey,
            listenPort: port
        })
        .where(eq(sites.siteId, siteId))
        .returning();

    if (!site) {
        logger.error("handleGetConfigMessage: Failed to update site");
        return;
    }

    let exitNode: ExitNode | undefined;
    if (site.exitNodeId) {
        [exitNode] = await db
            .select()
            .from(exitNodes)
            .where(eq(exitNodes.exitNodeId, site.exitNodeId))
            .limit(1);
        if (
            exitNode.reachableAt &&
            existingSite.subnet &&
            existingSite.listenPort
        ) {
            const payload = {
                oldDestination: {
                    destinationIP: existingSite.subnet?.split("/")[0],
                    destinationPort: existingSite.listenPort
                },
                newDestination: {
                    destinationIP: site.subnet?.split("/")[0],
                    destinationPort: site.listenPort
                }
            };

            await sendToExitNode(exitNode, {
                remoteType: "remoteExitNode/update-proxy-mapping",
                localPath: "/update-proxy-mapping",
                method: "POST",
                data: payload
            });
        }
    }

    const { peers, targets } = await buildClientConfigurationForNewtClient(
        site,
        exitNode
    );

    // Build the configuration response
    const configResponse = {
        ipAddress: site.address,
        peers,
        targets
    };

    logger.debug("Sending config: ", configResponse);

    return {
        message: {
            type: "newt/wg/receive-config",
            data: {
                ...configResponse
            }
        },
        broadcast: false,
        excludeSender: false,
    };
};

export async function buildClientConfigurationForNewtClient(
    site: Site,
    exitNode?: ExitNode
) {
    const siteId = site.siteId;

    // Get all clients connected to this site
    const clientsRes = await db
        .select()
        .from(clients)
        .innerJoin(
            clientSitesAssociationsCache,
            eq(clients.clientId, clientSitesAssociationsCache.clientId)
        )
        .where(eq(clientSitesAssociationsCache.siteId, siteId));

    let peers: Array<{
        publicKey: string;
        allowedIps: string[];
        endpoint?: string;
    }> = [];

    if (site.publicKey && site.endpoint && exitNode) {
        // Prepare peers data for the response
        peers = await Promise.all(
            clientsRes
                .filter((client) => {
                    if (!client.clients.pubKey) {
                        logger.warn(
                            `Client ${client.clients.clientId} has no public key, skipping`
                        );
                        return false;
                    }
                    if (!client.clients.subnet) {
                        logger.warn(
                            `Client ${client.clients.clientId} has no subnet, skipping`
                        );
                        return false;
                    }
                    return true;
                })
                .map(async (client) => {
                    // Add or update this peer on the olm if it is connected

                    // const allSiteResources = await db // only get the site resources that this client has access to
                    //     .select()
                    //     .from(siteResources)
                    //     .innerJoin(
                    //         clientSiteResourcesAssociationsCache,
                    //         eq(
                    //             siteResources.siteResourceId,
                    //             clientSiteResourcesAssociationsCache.siteResourceId
                    //         )
                    //     )
                    //     .where(
                    //         and(
                    //             eq(siteResources.siteId, site.siteId),
                    //             eq(
                    //                 clientSiteResourcesAssociationsCache.clientId,
                    //                 client.clients.clientId
                    //             )
                    //         )
                    //     );

                    // update the peer info on the olm
                    // if the peer has not been added yet this will be a no-op
                    await updatePeer(client.clients.clientId, {
                        siteId: site.siteId,
                        endpoint: site.endpoint!,
                        relayEndpoint: `${exitNode.endpoint}:${config.getRawConfig().gerbil.clients_start_port}`,
                        publicKey: site.publicKey!,
                        serverIP: site.address,
                        serverPort: site.listenPort
                        // remoteSubnets: generateRemoteSubnets(
                        //     allSiteResources.map(
                        //         ({ siteResources }) => siteResources
                        //     )
                        // ),
                        // aliases: generateAliasConfig(
                        //     allSiteResources.map(
                        //         ({ siteResources }) => siteResources
                        //     )
                        // )
                    });

                    // also trigger the peer add handshake in case the peer was not already added to the olm and we need to hole punch
                    // if it has already been added this will be a no-op
                    await initPeerAddHandshake(
                        // this will kick off the add peer process for the client
                        client.clients.clientId,
                        {
                            siteId,
                            exitNode: {
                                publicKey: exitNode.publicKey,
                                endpoint: exitNode.endpoint
                            }
                        }
                    );

                    return {
                        publicKey: client.clients.pubKey!,
                        allowedIps: [
                            `${client.clients.subnet.split("/")[0]}/32`
                        ], // we want to only allow from that client
                        endpoint: client.clientSitesAssociationsCache.isRelayed
                            ? ""
                            : client.clientSitesAssociationsCache.endpoint! // if its relayed it should be localhost
                    };
                })
        );
    }

    // Filter out any null values from peers that didn't have an olm
    const validPeers = peers.filter((peer) => peer !== null);

    // Get all enabled site resources for this site
    const allSiteResources = await db
        .select()
        .from(siteResources)
        .where(eq(siteResources.siteId, siteId));

    const targetsToSend: SubnetProxyTarget[] = [];

    for (const resource of allSiteResources) {
        // Get clients associated with this specific resource
        const resourceClients = await db
            .select({
                clientId: clients.clientId,
                pubKey: clients.pubKey,
                subnet: clients.subnet
            })
            .from(clients)
            .innerJoin(
                clientSiteResourcesAssociationsCache,
                eq(
                    clients.clientId,
                    clientSiteResourcesAssociationsCache.clientId
                )
            )
            .where(
                eq(
                    clientSiteResourcesAssociationsCache.siteResourceId,
                    resource.siteResourceId
                )
            );

        const resourceTargets = generateSubnetProxyTargets(
            resource,
            resourceClients
        );

        targetsToSend.push(...resourceTargets);
    }

    return {
        peers: validPeers,
        targets: targetsToSend
    };
}
