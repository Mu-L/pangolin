import {
    db,
    newts,
    blueprints,
    Blueprint,
    siteResources,
    roleSiteResources,
    userSiteResources,
    clientSiteResources
} from "@server/db";
import { Config, ConfigSchema } from "./types";
import {
    PublicResourcesResults,
    updatePublicResources
} from "./publicResources";
import { fromError } from "zod-validation-error";
import logger from "@server/logger";
import { sites } from "@server/db";
import { eq, and, isNotNull } from "drizzle-orm";
import {
    addTargets as addProxyTargets,
    sendBrowserGatewayTargets
} from "@server/routers/newt/targets";
import {
    ClientResourcesResults,
    updatePrivateResources
} from "./privateResources";
import { updateResourcePolicies } from "./resourcePolicies";
import { BlueprintSource } from "@server/routers/blueprints/types";
import { stringify as stringifyYaml } from "yaml";
import { generateName } from "@server/db/names";
import { handleMessagingForUpdatedSiteResource } from "@server/routers/siteResource";
import { rebuildClientAssociationsFromSiteResource } from "../rebuildClientAssociations";

type ApplyBlueprintArgs = {
    orgId: string;
    configData: unknown;
    name?: string;
    siteId?: number;
    source?: BlueprintSource;
};

export async function applyBlueprint({
    orgId,
    configData,
    siteId,
    name,
    source = "API"
}: ApplyBlueprintArgs): Promise<Blueprint> {
    let blueprintSucceeded: boolean = false;
    let blueprintMessage = "";
    let error: any | null = null;

    try {
        const validationResult = ConfigSchema.safeParse(configData);
        if (!validationResult.success) {
            throw new Error(fromError(validationResult.error).toString());
        }

        const config: Config = validationResult.data;

        let publicResourcesResults: PublicResourcesResults = [];
        let privateResourcesResults: ClientResourcesResults = [];
        await db.transaction(async (trx) => {
            await updateResourcePolicies(orgId, config, trx);

            publicResourcesResults = await updatePublicResources(
                orgId,
                config,
                trx,
                siteId
            );
            privateResourcesResults = await updatePrivateResources(
                orgId,
                config,
                trx,
                siteId
            );

            // We need to update the targets on the newts from the successfully updated information
            for (const result of publicResourcesResults) {
                for (const target of result.targetsToUpdate) {
                    const [site] = await trx
                        .select()
                        .from(sites)
                        .innerJoin(newts, eq(sites.siteId, newts.siteId))
                        .where(
                            and(
                                eq(sites.siteId, target.siteId),
                                eq(sites.orgId, orgId),
                                eq(sites.type, "newt"),
                                isNotNull(sites.pubKey)
                            )
                        )
                        .limit(1);

                    if (site) {
                        logger.debug(
                            `Updating target ${target.targetId} on site ${site.sites.siteId}`
                        );

                        // see if you can find a matching target health check from the healthchecksToUpdate array
                        const matchingHealthcheck =
                            result.healthchecksToUpdate.find(
                                (hc) => hc.targetId === target.targetId
                            );

                        if (["http", "tcp", "udp"].includes(target.mode)) {
                            await addProxyTargets(
                                site.newt.newtId,
                                [target],
                                matchingHealthcheck
                                    ? [matchingHealthcheck]
                                    : [],
                                result.proxyResource.mode === "udp"
                                    ? "udp"
                                    : "tcp",
                                site.newt.version
                            );
                        } else if (
                            ["ssh", "rdp", "vnc"].includes(target.mode)
                        ) {
                            await sendBrowserGatewayTargets(
                                site.newt.newtId,
                                [target],
                                site.newt.version
                            );
                        }
                    }
                }
            }

            logger.debug(
                `Successfully updated public resources for org ${orgId}: ${JSON.stringify(publicResourcesResults)}`
            );

            // We need to update the targets on the newts from the successfully updated information
            for (const result of privateResourcesResults) {
                rebuildClientAssociationsFromSiteResource(
                    result.newSiteResource
                ).catch((e) => {
                    logger.error(
                        `Failed to rebuild client associations for site resource ${result.newSiteResource.siteResourceId}. Error: ${e}`
                    );
                });

                handleMessagingForUpdatedSiteResource(
                    result.oldSiteResource,
                    result.newSiteResource,
                    result.oldSites.map((site) => ({
                        // only need to run this on the old sites because the new sites are added above
                        siteId: site.siteId,
                        orgId: result.newSiteResource.orgId
                    }))
                ).catch((err) => {
                    logger.error(
                        `Error handling messaging for updated site resource ${result.newSiteResource.siteResourceId}:`,
                        err
                    );
                });
            }

            logger.debug(
                `Successfully updated private resources for org ${orgId}: ${JSON.stringify(privateResourcesResults)}`
            );
        });

        blueprintSucceeded = true;
        blueprintMessage = "Blueprint applied successfully";
    } catch (err) {
        blueprintSucceeded = false;
        blueprintMessage = `Blueprint applied with errors: ${err}`;
        logger.error(blueprintMessage);
        error = err;
    }

    let blueprint: Blueprint | null = null;
    await db.transaction(async (trx) => {
        const newBlueprint = await trx
            .insert(blueprints)
            .values({
                orgId,
                name: name ?? generateName(),
                contents: stringifyYaml(configData),
                createdAt: Math.floor(Date.now() / 1000),
                succeeded: blueprintSucceeded,
                message: blueprintMessage,
                source
            })
            .returning();

        blueprint = newBlueprint[0];
    });

    if (!blueprint || (source !== "UI" && !blueprintSucceeded)) {
        //             ^^^^^^^^^^^^^^^ The UI considers a failed blueprint as a valid response
        throw error ?? "Unknown Server Error";
    }

    return blueprint;
}
