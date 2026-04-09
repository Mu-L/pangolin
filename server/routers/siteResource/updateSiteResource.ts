import { isLicensedOrSubscribed } from "#dynamic/lib/isLicencedOrSubscribed";
import {
    clientSiteResources,
    clientSiteResourcesAssociationsCache,
    db,
    newts,
    orgs,
    roles,
    roleSiteResources,
    siteNetworks,
    SiteResource,
    siteResources,
    sites,
    networks,
    Transaction,
    userSiteResources
} from "@server/db";
import response from "@server/lib/response";
import { eq, and, ne, inArray } from "drizzle-orm";
import { OpenAPITags, registry } from "@server/openApi";
import { updatePeerData, updateTargets } from "@server/routers/client/targets";
import { tierMatrix } from "@server/lib/billing/tierMatrix";
import {
    generateAliasConfig,
    generateRemoteSubnets,
    generateSubnetProxyTargetV2,
    isIpInCidr,
    portRangeStringSchema
} from "@server/lib/ip";
import { rebuildClientAssociationsFromSiteResource } from "@server/lib/rebuildClientAssociations";
import logger from "@server/logger";
import HttpCode from "@server/types/HttpCode";
import { NextFunction, Request, Response } from "express";
import createHttpError from "http-errors";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const updateSiteResourceParamsSchema = z.strictObject({
    siteResourceId: z.string().transform(Number).pipe(z.int().positive())
});

const updateSiteResourceSchema = z
    .strictObject({
        name: z.string().min(1).max(255).optional(),
        siteIds: z.array(z.int()),
        // niceId: z.string().min(1).max(255).regex(/^[a-zA-Z0-9-]+$/, "niceId can only contain letters, numbers, and dashes").optional(),
        niceId: z
            .string()
            .min(1)
            .max(255)
            .regex(
                /^[a-zA-Z0-9-]+$/,
                "niceId can only contain letters, numbers, and dashes"
            )
            .optional(),
        // mode: z.enum(["host", "cidr", "port"]).optional(),
        mode: z.enum(["host", "cidr"]).optional(),
        // protocol: z.enum(["tcp", "udp"]).nullish(),
        // proxyPort: z.int().positive().nullish(),
        // destinationPort: z.int().positive().nullish(),
        destination: z.string().min(1).optional(),
        enabled: z.boolean().optional(),
        alias: z
            .string()
            .regex(
                /^(?:[a-zA-Z0-9*?](?:[a-zA-Z0-9*?-]{0,61}[a-zA-Z0-9*?])?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/,
                "Alias must be a fully qualified domain name with optional wildcards (e.g., example.internal, *.example.internal, host-0?.example.internal)"
            )
            .nullish(),
        userIds: z.array(z.string()),
        roleIds: z.array(z.int()),
        clientIds: z.array(z.int()),
        tcpPortRangeString: portRangeStringSchema,
        udpPortRangeString: portRangeStringSchema,
        disableIcmp: z.boolean().optional(),
        authDaemonPort: z.int().positive().nullish(),
        authDaemonMode: z.enum(["site", "remote"]).optional()
    })
    .strict()
    .refine(
        (data) => {
            if (data.mode === "host" && data.destination) {
                const isValidIP = z
                    // .union([z.ipv4(), z.ipv6()])
                    .union([z.ipv4()]) // for now lets just do ipv4 until we verify ipv6 works everywhere
                    .safeParse(data.destination).success;

                if (isValidIP) {
                    return true;
                }

                // Check if it's a valid domain (hostname pattern, TLD not required)
                const domainRegex =
                    /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
                const isValidDomain = domainRegex.test(data.destination);
                const isValidAlias =
                    data.alias !== undefined &&
                    data.alias !== null &&
                    data.alias.trim() !== "";

                return isValidDomain && isValidAlias; // require the alias to be set in the case of domain
            }
            return true;
        },
        {
            message:
                "Destination must be a valid IP address or valid domain AND alias is required"
        }
    )
    .refine(
        (data) => {
            if (data.mode === "cidr" && data.destination) {
                // Check if it's a valid CIDR (v4 or v6)
                const isValidCIDR = z
                    .union([z.cidrv4(), z.cidrv6()])
                    .safeParse(data.destination).success;
                return isValidCIDR;
            }
            return true;
        },
        {
            message: "Destination must be a valid CIDR notation for cidr mode"
        }
    );

export type UpdateSiteResourceBody = z.infer<typeof updateSiteResourceSchema>;
export type UpdateSiteResourceResponse = SiteResource;

registry.registerPath({
    method: "post",
    path: "/site-resource/{siteResourceId}",
    description: "Update a site resource.",
    tags: [OpenAPITags.PrivateResource],
    request: {
        params: updateSiteResourceParamsSchema,
        body: {
            content: {
                "application/json": {
                    schema: updateSiteResourceSchema
                }
            }
        }
    },
    responses: {}
});

export async function updateSiteResource(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = updateSiteResourceParamsSchema.safeParse(
            req.params
        );
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const parsedBody = updateSiteResourceSchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { siteResourceId } = parsedParams.data;
        const {
            name,
            siteIds, // because it can change
            niceId,
            mode,
            destination,
            alias,
            enabled,
            userIds,
            roleIds,
            clientIds,
            tcpPortRangeString,
            udpPortRangeString,
            disableIcmp,
            authDaemonPort,
            authDaemonMode
        } = parsedBody.data;

        // Check if site resource exists
        const [existingSiteResource] = await db
            .select()
            .from(siteResources)
            .where(and(eq(siteResources.siteResourceId, siteResourceId)))
            .limit(1);

        if (!existingSiteResource) {
            return next(
                createHttpError(HttpCode.NOT_FOUND, "Site resource not found")
            );
        }

        const isLicensedSshPam = await isLicensedOrSubscribed(
            existingSiteResource.orgId,
            tierMatrix.sshPam
        );

        const [org] = await db
            .select()
            .from(orgs)
            .where(eq(orgs.orgId, existingSiteResource.orgId))
            .limit(1);

        if (!org) {
            return next(
                createHttpError(HttpCode.NOT_FOUND, "Organization not found")
            );
        }

        if (!org.subnet || !org.utilitySubnet) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    `Organization with ID ${existingSiteResource.orgId} has no subnet or utilitySubnet defined defined`
                )
            );
        }

        // Verify the site exists and belongs to the org
        const sitesToAssign = await db
            .select()
            .from(sites)
            .where(
                and(
                    inArray(sites.siteId, siteIds),
                    eq(sites.orgId, existingSiteResource.orgId)
                )
            )
            .limit(1);

        if (sitesToAssign.length !== siteIds.length) {
            return next(
                createHttpError(HttpCode.NOT_FOUND, "Some site not found")
            );
        }

        // Only check if destination is an IP address
        const isIp = z
            .union([z.ipv4(), z.ipv6()])
            .safeParse(destination).success;
        if (
            isIp &&
            (isIpInCidr(destination!, org.subnet) ||
                isIpInCidr(destination!, org.utilitySubnet))
        ) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "IP can not be in the CIDR range of the organization's subnet or utility subnet"
                )
            );
        }

        let sitesChanged = false;
        const existingSiteIds = existingSiteResource.networkId
            ? await db
                  .select()
                  .from(siteNetworks)
                  .where(
                      eq(siteNetworks.networkId, existingSiteResource.networkId)
                  )
            : [];

        const existingSiteIdSet = new Set(existingSiteIds.map((s) => s.siteId));
        const newSiteIdSet = new Set(siteIds);

        if (
            existingSiteIdSet.size !== newSiteIdSet.size ||
            ![...existingSiteIdSet].every((id) => newSiteIdSet.has(id))
        ) {
            sitesChanged = true;
        }

        // make sure the alias is unique within the org if provided
        if (alias) {
            const [conflict] = await db
                .select()
                .from(siteResources)
                .where(
                    and(
                        eq(siteResources.orgId, existingSiteResource.orgId),
                        eq(siteResources.alias, alias.trim()),
                        ne(siteResources.siteResourceId, siteResourceId) // exclude self
                    )
                )
                .limit(1);

            if (conflict) {
                return next(
                    createHttpError(
                        HttpCode.CONFLICT,
                        "Alias already in use by another site resource"
                    )
                );
            }
        }

        let updatedSiteResource: SiteResource | undefined;
        await db.transaction(async (trx) => {
            // if the site is changed we need to delete and recreate the resource to avoid complications with the rebuild function otherwise we can just update in place
            if (sitesChanged) {
                // delete the existing site resource
                await trx
                    .delete(siteResources)
                    .where(
                        and(eq(siteResources.siteResourceId, siteResourceId))
                    );

                await rebuildClientAssociationsFromSiteResource(
                    existingSiteResource,
                    trx
                );

                // create the new site resource from the removed one - the ID should stay the same
                const [insertedSiteResource] = await trx
                    .insert(siteResources)
                    .values({
                        ...existingSiteResource
                    })
                    .returning();

                // wait some time to allow for messages to be handled
                await new Promise((resolve) => setTimeout(resolve, 750));

                const sshPamSet =
                    isLicensedSshPam &&
                    (authDaemonPort !== undefined ||
                        authDaemonMode !== undefined)
                        ? {
                              ...(authDaemonPort !== undefined && {
                                  authDaemonPort
                              }),
                              ...(authDaemonMode !== undefined && {
                                  authDaemonMode
                              })
                          }
                        : {};
                [updatedSiteResource] = await trx
                    .update(siteResources)
                    .set({
                        name,
                        niceId,
                        mode,
                        destination,
                        enabled,
                        alias: alias && alias.trim() ? alias : null,
                        tcpPortRangeString,
                        udpPortRangeString,
                        disableIcmp,
                        ...sshPamSet
                    })
                    .where(
                        and(
                            eq(
                                siteResources.siteResourceId,
                                insertedSiteResource.siteResourceId
                            )
                        )
                    )
                    .returning();

                if (!updatedSiteResource) {
                    throw new Error(
                        "Failed to create updated site resource after site change"
                    );
                }

                //////////////////// update the associations ////////////////////

                const [adminRole] = await trx
                    .select()
                    .from(roles)
                    .where(
                        and(
                            eq(roles.isAdmin, true),
                            eq(roles.orgId, updatedSiteResource.orgId)
                        )
                    )
                    .limit(1);

                if (!adminRole) {
                    return next(
                        createHttpError(
                            HttpCode.NOT_FOUND,
                            `Admin role not found`
                        )
                    );
                }

                await trx.insert(roleSiteResources).values({
                    roleId: adminRole.roleId,
                    siteResourceId: updatedSiteResource.siteResourceId
                });

                if (roleIds.length > 0) {
                    await trx.insert(roleSiteResources).values(
                        roleIds.map((roleId) => ({
                            roleId,
                            siteResourceId: updatedSiteResource!.siteResourceId
                        }))
                    );
                }

                if (userIds.length > 0) {
                    await trx.insert(userSiteResources).values(
                        userIds.map((userId) => ({
                            userId,
                            siteResourceId: updatedSiteResource!.siteResourceId
                        }))
                    );
                }

                if (clientIds.length > 0) {
                    await trx.insert(clientSiteResources).values(
                        clientIds.map((clientId) => ({
                            clientId,
                            siteResourceId: updatedSiteResource!.siteResourceId
                        }))
                    );
                }

                await rebuildClientAssociationsFromSiteResource(
                    updatedSiteResource,
                    trx
                );
            } else {
                // Update the site resource
                const sshPamSet =
                    isLicensedSshPam &&
                    (authDaemonPort !== undefined ||
                        authDaemonMode !== undefined)
                        ? {
                              ...(authDaemonPort !== undefined && {
                                  authDaemonPort
                              }),
                              ...(authDaemonMode !== undefined && {
                                  authDaemonMode
                              })
                          }
                        : {};
                [updatedSiteResource] = await trx
                    .update(siteResources)
                    .set({
                        name: name,
                        mode: mode,
                        destination: destination,
                        enabled: enabled,
                        alias: alias && alias.trim() ? alias : null,
                        tcpPortRangeString: tcpPortRangeString,
                        udpPortRangeString: udpPortRangeString,
                        disableIcmp: disableIcmp,
                        ...sshPamSet
                    })
                    .where(
                        and(eq(siteResources.siteResourceId, siteResourceId))
                    )
                    .returning();

                //////////////////// update the associations ////////////////////

                // delete the site - site resources associations
                await trx
                    .delete(siteNetworks)
                    .where(
                        eq(
                            siteNetworks.networkId,
                            updatedSiteResource.networkId!
                        )
                    );

                for (const siteId of siteIds) {
                    await trx.insert(siteNetworks).values({
                        siteId: siteId,
                        networkId: updatedSiteResource.networkId!
                    });
                }

                await trx
                    .delete(clientSiteResources)
                    .where(
                        eq(clientSiteResources.siteResourceId, siteResourceId)
                    );

                if (clientIds.length > 0) {
                    await trx.insert(clientSiteResources).values(
                        clientIds.map((clientId) => ({
                            clientId,
                            siteResourceId
                        }))
                    );
                }

                await trx
                    .delete(userSiteResources)
                    .where(
                        eq(userSiteResources.siteResourceId, siteResourceId)
                    );

                if (userIds.length > 0) {
                    await trx.insert(userSiteResources).values(
                        userIds.map((userId) => ({
                            userId,
                            siteResourceId
                        }))
                    );
                }

                // Get all admin role IDs for this org to exclude from deletion
                const adminRoles = await trx
                    .select()
                    .from(roles)
                    .where(
                        and(
                            eq(roles.isAdmin, true),
                            eq(roles.orgId, updatedSiteResource.orgId)
                        )
                    );
                const adminRoleIds = adminRoles.map((role) => role.roleId);

                if (adminRoleIds.length > 0) {
                    await trx.delete(roleSiteResources).where(
                        and(
                            eq(
                                roleSiteResources.siteResourceId,
                                siteResourceId
                            ),
                            ne(roleSiteResources.roleId, adminRoleIds[0]) // delete all but the admin role
                        )
                    );
                } else {
                    await trx
                        .delete(roleSiteResources)
                        .where(
                            eq(roleSiteResources.siteResourceId, siteResourceId)
                        );
                }

                if (roleIds.length > 0) {
                    await trx.insert(roleSiteResources).values(
                        roleIds.map((roleId) => ({
                            roleId,
                            siteResourceId
                        }))
                    );
                }

                logger.info(`Updated site resource ${siteResourceId}`);

                await handleMessagingForUpdatedSiteResource(
                    existingSiteResource,
                    updatedSiteResource,
                    siteIds.map((siteId) => ({
                        siteId,
                        orgId: existingSiteResource.orgId
                    })),
                    trx
                );
            }
        });

        return response(res, {
            data: updatedSiteResource,
            success: true,
            error: false,
            message: "Site resource updated successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error("Error updating site resource:", error);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Failed to update site resource"
            )
        );
    }
}

export async function handleMessagingForUpdatedSiteResource(
    existingSiteResource: SiteResource | undefined,
    updatedSiteResource: SiteResource,
    sites: { siteId: number; orgId: string }[],
    trx: Transaction
) {
    logger.debug(
        "handleMessagingForUpdatedSiteResource: existingSiteResource is: ",
        existingSiteResource
    );
    logger.debug(
        "handleMessagingForUpdatedSiteResource: updatedSiteResource is: ",
        updatedSiteResource
    );

    const { mergedAllClients } =
        await rebuildClientAssociationsFromSiteResource(
            existingSiteResource || updatedSiteResource, // we want to rebuild based on the existing resource then we will apply the change to the destination below
            trx
        );

    // after everything is rebuilt above we still need to update the targets and remote subnets if the destination changed
    const destinationChanged =
        existingSiteResource &&
        existingSiteResource.destination !== updatedSiteResource.destination;
    const aliasChanged =
        existingSiteResource &&
        existingSiteResource.alias !== updatedSiteResource.alias;
    const portRangesChanged =
        existingSiteResource &&
        (existingSiteResource.tcpPortRangeString !==
            updatedSiteResource.tcpPortRangeString ||
            existingSiteResource.udpPortRangeString !==
                updatedSiteResource.udpPortRangeString ||
            existingSiteResource.disableIcmp !==
                updatedSiteResource.disableIcmp);

    // if the existingSiteResource is undefined (new resource) we don't need to do anything here, the rebuild above handled it all

    if (destinationChanged || aliasChanged || portRangesChanged) {
        for (const site of sites) {
            const [newt] = await trx
                .select()
                .from(newts)
                .where(eq(newts.siteId, site.siteId))
                .limit(1);

            if (!newt) {
                throw new Error(
                    "Newt not found for site during site resource update"
                );
            }

            // Only update targets on newt if destination changed
            if (destinationChanged || portRangesChanged) {
                const oldTarget = generateSubnetProxyTargetV2(
                    existingSiteResource,
                    mergedAllClients
                );
                const newTarget = generateSubnetProxyTargetV2(
                    updatedSiteResource,
                    mergedAllClients
                );

                await updateTargets(
                    newt.newtId,
                    {
                        oldTargets: oldTarget ? [oldTarget] : [],
                        newTargets: newTarget ? [newTarget] : []
                    },
                    newt.version
                );
            }

            const olmJobs: Promise<void>[] = [];
            for (const client of mergedAllClients) {
                // does this client have access to another resource on this site that has the same destination still? if so we dont want to remove it from their olm yet
                // todo: optimize this query if needed
                const oldDestinationStillInUseSites = await trx
                    .select()
                    .from(siteResources)
                    .innerJoin(
                        clientSiteResourcesAssociationsCache,
                        eq(
                            clientSiteResourcesAssociationsCache.siteResourceId,
                            siteResources.siteResourceId
                        )
                    )
                    .innerJoin(
                        siteNetworks,
                        eq(siteNetworks.networkId, siteResources.networkId)
                    )
                    .where(
                        and(
                            eq(
                                clientSiteResourcesAssociationsCache.clientId,
                                client.clientId
                            ),
                            eq(siteNetworks.siteId, site.siteId),
                            eq(
                                siteResources.destination,
                                existingSiteResource.destination
                            ),
                            ne(
                                siteResources.siteResourceId,
                                existingSiteResource.siteResourceId
                            )
                        )
                    );

                const oldDestinationStillInUseByASite =
                    oldDestinationStillInUseSites.length > 0;

                // we also need to update the remote subnets on the olms for each client that has access to this site
                olmJobs.push(
                    updatePeerData(
                        client.clientId,
                        site.siteId,
                        destinationChanged
                            ? {
                                  oldRemoteSubnets:
                                      !oldDestinationStillInUseByASite
                                          ? generateRemoteSubnets([
                                                existingSiteResource
                                            ])
                                          : [],
                                  newRemoteSubnets: generateRemoteSubnets([
                                      updatedSiteResource
                                  ])
                              }
                            : undefined,
                        aliasChanged
                            ? {
                                  oldAliases: generateAliasConfig([
                                      existingSiteResource
                                  ]),
                                  newAliases: generateAliasConfig([
                                      updatedSiteResource
                                  ])
                              }
                            : undefined
                    )
                );
            }

            await Promise.all(olmJobs);
        }
    }
}
