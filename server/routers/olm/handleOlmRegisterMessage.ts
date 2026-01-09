import {
    clientPostureSnapshots,
    clientSiteResourcesAssociationsCache,
    db,
    fingerprints,
    orgs,
    siteResources
} from "@server/db";
import { MessageHandler } from "@server/routers/ws";
import {
    clients,
    clientSitesAssociationsCache,
    exitNodes,
    Olm,
    olms,
    sites
} from "@server/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { addPeer, deletePeer } from "../newt/peers";
import logger from "@server/logger";
import { generateAliasConfig } from "@server/lib/ip";
import { generateRemoteSubnets } from "@server/lib/ip";
import { checkOrgAccessPolicy } from "#dynamic/lib/checkOrgAccessPolicy";
import { validateSessionToken } from "@server/auth/sessions/app";
import config from "@server/lib/config";
import { encodeHexLowerCase } from "@oslojs/encoding";
import { sha256 } from "@oslojs/crypto/sha2";

export const handleOlmRegisterMessage: MessageHandler = async (context) => {
    logger.info("Handling register olm message!");
    const { message, client: c, sendToClient } = context;
    const olm = c as Olm;

    const now = Math.floor(Date.now() / 1000);

    if (!olm) {
        logger.warn("Olm not found");
        return;
    }

    const {
        publicKey,
        relay,
        olmVersion,
        olmAgent,
        orgId,
        userToken,
        fingerprint,
        postures
    } = message.data;

    if (!olm.clientId) {
        logger.warn("Olm client ID not found");
        return;
    }

    const [client] = await db
        .select()
        .from(clients)
        .where(eq(clients.clientId, olm.clientId))
        .limit(1);

    if (!client) {
        logger.warn("Client ID not found");
        return;
    }

    const [org] = await db
        .select()
        .from(orgs)
        .where(eq(orgs.orgId, client.orgId))
        .limit(1);

    if (!org) {
        logger.warn("Org not found");
        return;
    }

    if (orgId) {
        if (!olm.userId) {
            logger.warn("Olm has no user ID");
            return;
        }

        const { session: userSession, user } =
            await validateSessionToken(userToken);
        if (!userSession || !user) {
            logger.warn("Invalid user session for olm register");
            return; // by returning here we just ignore the ping and the setInterval will force it to disconnect
        }
        if (user.userId !== olm.userId) {
            logger.warn("User ID mismatch for olm register");
            return;
        }

        const sessionId = encodeHexLowerCase(
            sha256(new TextEncoder().encode(userToken))
        );

        const policyCheck = await checkOrgAccessPolicy({
            orgId: orgId,
            userId: olm.userId,
            sessionId // this is the user token passed in the message
        });

        if (!policyCheck.allowed) {
            logger.warn(
                `Olm user ${olm.userId} does not pass access policies for org ${orgId}: ${policyCheck.error}`
            );
            return;
        }
    }

    logger.debug(
        `Olm client ID: ${client.clientId}, Public Key: ${publicKey}, Relay: ${relay}`
    );

    if (!publicKey) {
        logger.warn("Public key not provided");
        return;
    }

    if (
        (olmVersion && olm.version !== olmVersion) ||
        (olmAgent && olm.agent !== olmAgent)
    ) {
        await db
            .update(olms)
            .set({
                version: olmVersion,
                agent: olmAgent
            })
            .where(eq(olms.olmId, olm.olmId));
    }

    if (client.pubKey !== publicKey) {
        logger.info(
            "Public key mismatch. Updating public key and clearing session info..."
        );
        // Update the client's public key
        await db
            .update(clients)
            .set({
                pubKey: publicKey
            })
            .where(eq(clients.clientId, client.clientId));

        // set isRelay to false for all of the client's sites to reset the connection metadata
        await db
            .update(clientSitesAssociationsCache)
            .set({
                isRelayed: relay == true
            })
            .where(eq(clientSitesAssociationsCache.clientId, client.clientId));
    }

    // Get all sites data
    const sitesData = await db
        .select()
        .from(sites)
        .innerJoin(
            clientSitesAssociationsCache,
            eq(sites.siteId, clientSitesAssociationsCache.siteId)
        )
        .where(eq(clientSitesAssociationsCache.clientId, client.clientId));

    // Prepare an array to store site configurations
    const siteConfigurations = [];
    logger.debug(
        `Found ${sitesData.length} sites for client ${client.clientId}`
    );

    // this prevents us from accepting a register from an olm that has not hole punched yet.
    // the olm will pump the register so we can keep checking
    // TODO: I still think there is a better way to do this rather than locking it out here but ???
    if (now - (client.lastHolePunch || 0) > 5 && sitesData.length > 0) {
        logger.warn(
            "Client last hole punch is too old and we have sites to send; skipping this register"
        );
        return;
    }

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
        if (clientSite.endpoint) {
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

    if (fingerprint) {
        const [existingFingerprint] = await db
            .select()
            .from(fingerprints)
            .where(eq(fingerprints.olmId, olm.olmId))
            .limit(1);

        if (!existingFingerprint) {
            await db.insert(fingerprints).values({
                olmId: olm.olmId,
                firstSeen: now,
                lastSeen: now,

                username: fingerprint.username,
                hostname: fingerprint.hostname,
                platform: fingerprint.platform,
                osVersion: fingerprint.osVersion,
                kernelVersion: fingerprint.kernelVersion,
                arch: fingerprint.arch,
                deviceModel: fingerprint.deviceModel,
                serialNumber: fingerprint.serialNumber
            });
        } else {
            await db
                .update(fingerprints)
                .set({
                    lastSeen: now,

                    username: fingerprint.username,
                    hostname: fingerprint.hostname,
                    platform: fingerprint.platform,
                    osVersion: fingerprint.osVersion,
                    kernelVersion: fingerprint.kernelVersion,
                    arch: fingerprint.arch,
                    deviceModel: fingerprint.deviceModel,
                    serialNumber: fingerprint.serialNumber
                })
                .where(eq(fingerprints.olmId, olm.olmId));
        }
    }

    if (postures && olm.clientId) {
        await db.insert(clientPostureSnapshots).values({
            clientId: olm.clientId,

            biometricsEnabled: postures?.biometricsEnabled,
            diskEncrypted: postures?.diskEncrypted,
            firewallEnabled: postures?.firewallEnabled,
            autoUpdatesEnabled: postures?.autoUpdatesEnabled,
            tpmAvailable: postures?.tpmAvailable,

            windowsDefenderEnabled: postures?.windowsDefenderEnabled,

            macosSipEnabled: postures?.macosSipEnabled,
            macosGatekeeperEnabled: postures?.macosGatekeeperEnabled,
            macosFirewallStealthMode: postures?.macosFirewallStealthMode,

            linuxAppArmorEnabled: postures?.linuxAppArmorEnabled,
            linuxSELinuxEnabled: postures?.linuxSELinuxEnabled,

            collectedAt: now
        });
    }

    // REMOVED THIS SO IT CREATES THE INTERFACE AND JUST WAITS FOR THE SITES
    // if (siteConfigurations.length === 0) {
    //     logger.warn("No valid site configurations found");
    //     return;
    // }

    // Return connect message with all site configurations
    return {
        message: {
            type: "olm/wg/connect",
            data: {
                sites: siteConfigurations,
                tunnelIP: client.subnet,
                utilitySubnet: org.utilitySubnet
            }
        },
        broadcast: false,
        excludeSender: false
    };
};
