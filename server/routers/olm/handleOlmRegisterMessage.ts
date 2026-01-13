import {
    Client,
    clientSiteResourcesAssociationsCache,
    db,
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
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { addPeer, deletePeer } from "../newt/peers";
import logger from "@server/logger";
import { generateAliasConfig } from "@server/lib/ip";
import { generateRemoteSubnets } from "@server/lib/ip";
import { checkOrgAccessPolicy } from "#dynamic/lib/checkOrgAccessPolicy";
import { validateSessionToken } from "@server/auth/sessions/app";
import config from "@server/lib/config";
import { encodeHexLowerCase } from "@oslojs/encoding";
import { sha256 } from "@oslojs/crypto/sha2";
import { buildSiteConfigurationForOlmClient } from "./buildSiteConfigurationForOlmClient";

export const handleOlmRegisterMessage: MessageHandler = async (context) => {
    logger.info("Handling register olm message!");
    const { message, client: c, sendToClient } = context;
    const olm = c as Olm;

    const now = Math.floor(Date.now() / 1000);

    if (!olm) {
        logger.warn("Olm not found");
        return;
    }

    const { publicKey, relay, olmVersion, olmAgent, orgId, userToken } =
        message.data;

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
    const sitesCountResult = await db
        .select({ count: count() })
        .from(sites)
        .innerJoin(
            clientSitesAssociationsCache,
            eq(sites.siteId, clientSitesAssociationsCache.siteId)
        )
        .where(eq(clientSitesAssociationsCache.clientId, client.clientId));

    // Extract the count value from the result array
    const sitesCount =
        sitesCountResult.length > 0 ? sitesCountResult[0].count : 0;

    // Prepare an array to store site configurations
    logger.debug(`Found ${sitesCount} sites for client ${client.clientId}`);

    // this prevents us from accepting a register from an olm that has not hole punched yet.
    // the olm will pump the register so we can keep checking
    // TODO: I still think there is a better way to do this rather than locking it out here but ???
    if (now - (client.lastHolePunch || 0) > 5 && sitesCount > 0) {
        logger.warn(
            "Client last hole punch is too old and we have sites to send; skipping this register"
        );
        return;
    }

    // NOTE: its important that the client here is the old client and the public key is the new key
    const siteConfigurations = await buildSiteConfigurationForOlmClient(
        client,
        publicKey,
        relay
    );

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
