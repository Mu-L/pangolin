import { ExitNode, exitNodes, Newt, Site, db } from "@server/db";
import { eq } from "drizzle-orm";
import { sendToClient } from "#dynamic/routers/ws";
import logger from "@server/logger";
import {
    buildBrowserGatewayTargetConfigurationForNewtClient,
    buildClientConfigurationForNewtClient,
    buildTargetConfigurationForNewtClient
} from "./buildConfiguration";
import { canCompress } from "@server/lib/clientVersionChecks";

export async function sendNewtSyncMessage(newt: Newt, site: Site) {
    const { tcpTargets, udpTargets, validHealthCheckTargets } =
        await buildTargetConfigurationForNewtClient(site.siteId);

    const browserGatewayTargets =
        await buildBrowserGatewayTargetConfigurationForNewtClient(site.siteId);

    let exitNode: ExitNode | undefined;
    if (site.exitNodeId) {
        [exitNode] = await db
            .select()
            .from(exitNodes)
            .where(eq(exitNodes.exitNodeId, site.exitNodeId))
            .limit(1);
    }
    const { peers, targets } = await buildClientConfigurationForNewtClient(
        site,
        exitNode
    );

    await sendToClient(
        newt.newtId,
        {
            type: "newt/sync",
            data: {
                proxyTargets: {
                    udp: udpTargets,
                    tcp: tcpTargets
                },
                healthCheckTargets: validHealthCheckTargets,
                peers: peers,
                clientTargets: targets,
                browserGatewayTargets: browserGatewayTargets.map((t) => ({
                    id: t.browserGatewayTargetId,
                    resourceId: t.resourceId,
                    siteId: t.siteId,
                    type: t.type,
                    destination: t.destination,
                    destinationPort: t.destinationPort
                }))
            }
        },
        {
            compress: canCompress(newt.version, "newt")
        }
    ).catch((error) => {
        logger.warn(`Error sending newt sync message:`, error);
    });
}
