import { isLicensedOrSubscribed } from "#dynamic/lib/isLicencedOrSubscribed";
import {
    clientSiteResources,
    clientSiteResourcesAssociationsCache,
    db,
    newts,
    orgs,
    roles,
    roleSiteResources,
    SiteResource,
    siteResources,
    sites,
    Transaction,
    userSiteResources
} from "@server/db";
import { tierMatrix } from "@server/lib/billing/tierMatrix";
import { validateAndConstructDomain } from "@server/lib/domainUtils";
import {
    generateAliasConfig,
    generateRemoteSubnets,
    generateSubnetProxyTargetV2,
    isIpInCidr,
    portRangeStringSchema
} from "@server/lib/ip";
import { rebuildClientAssociationsFromSiteResource } from "@server/lib/rebuildClientAssociations";
import response from "@server/lib/response";
import logger from "@server/logger";
import { OpenAPITags, registry } from "@server/openApi";
import { updatePeerData, updateTargets } from "@server/routers/client/targets";
import HttpCode from "@server/types/HttpCode";
import { and, eq, ne } from "drizzle-orm";
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
        siteId: z.int(),
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
        mode: z.enum(["host", "cidr", "http"]).optional(),
        ssl: z.boolean().optional(),
        scheme: z.enum(["http", "https"]).nullish(),
        // proxyPort: z.int().positive().nullish(),
        destinationPort: z.int().positive().nullish(),
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
        authDaemonMode: z.enum(["site", "remote"]).optional(),
        domainId: z.string().optional(),
        subdomain: z.string().optional()
    })
    .strict()
    .refine(
        (data) => {
            if (
                (data.mode === "host" ||
                    data.mode == "http") &&
                data.destination
            ) {
                if (data.mode == "host") {
                    const isValidIP = z
                        // .union([z.ipv4(), z.ipv6()])
                        .union([z.ipv4()]) // for now lets just do ipv4 until we verify ipv6 works everywhere
                        .safeParse(data.destination).success;

                    if (isValidIP) {
                        return true;
                    }
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
    )
    .refine(
        (data) => {
            if (data.mode !== "http") return true;
            return (
                data.scheme !== undefined &&
                data.scheme !== null &&
                data.destinationPort !== undefined &&
                data.destinationPort !== null &&
                data.destinationPort >= 1 &&
                data.destinationPort <= 65535
            );
        },
        {
            message:
                "HTTP mode requires scheme (http or https) and a valid destination port"
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
            siteId, // because it can change
            niceId,
            mode,
            scheme,
            destination,
            destinationPort,
            alias,
            ssl,
            enabled,
            userIds,
            roleIds,
            clientIds,
            tcpPortRangeString,
            udpPortRangeString,
            disableIcmp,
            authDaemonPort,
            authDaemonMode,
            domainId,
            subdomain
        } = parsedBody.data;

        const [site] = await db
            .select()
            .from(sites)
            .where(eq(sites.siteId, siteId))
            .limit(1);

        if (!site) {
            return next(createHttpError(HttpCode.NOT_FOUND, "Site not found"));
        }

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

        let existingSite = site;
        let siteChanged = false;
        if (existingSiteResource.siteId !== siteId) {
            siteChanged = true;
            // get the existing site
            [existingSite] = await db
                .select()
                .from(sites)
                .where(eq(sites.siteId, existingSiteResource.siteId))
                .limit(1);

            if (!existingSite) {
                return next(
                    createHttpError(
                        HttpCode.NOT_FOUND,
                        "Existing site not found"
                    )
                );
            }
        }

        let fullDomain: string | null = null;
        let finalSubdomain: string | null = null;
        let finalAlias = alias ? alias.trim() : null;
        if (domainId && subdomain) {
            // Validate domain and construct full domain
            const domainResult = await validateAndConstructDomain(
                domainId,
                org.orgId,
                subdomain
            );

            if (!domainResult.success) {
                return next(
                    createHttpError(HttpCode.BAD_REQUEST, domainResult.error)
                );
            }

            fullDomain = domainResult.fullDomain;
            finalSubdomain = domainResult.subdomain;
            finalAlias = fullDomain; // we will use the full domain as the alias for uniqueness checks and routing
        }

        // make sure the alias is unique within the org if provided
        if (finalAlias) {
            const [conflict] = await db
                .select()
                .from(siteResources)
                .where(
                    and(
                        eq(siteResources.orgId, existingSiteResource.orgId),
                        eq(siteResources.alias, finalAlias.trim()),
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
            if (siteChanged) {
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
                        siteId,
                        niceId,
                        mode,
                        scheme,
                        ssl,
                        destination,
                        destinationPort,
                        enabled,
                        alias: finalAlias,
                        tcpPortRangeString,
                        udpPortRangeString,
                        disableIcmp,
                        domainId,
                        subdomain: finalSubdomain,
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
                        siteId: siteId,
                        mode: mode,
                        scheme,
                        ssl,
                        destination: destination,
                        destinationPort: destinationPort,
                        enabled: enabled,
                        alias: finalAlias,
                        tcpPortRangeString: tcpPortRangeString,
                        udpPortRangeString: udpPortRangeString,
                        disableIcmp: disableIcmp,
                        domainId,
                        subdomain: finalSubdomain,
                        ...sshPamSet
                    })
                    .where(
                        and(eq(siteResources.siteResourceId, siteResourceId))
                    )
                    .returning();

                //////////////////// update the associations ////////////////////

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

                logger.info(
                    `Updated site resource ${siteResourceId} for site ${siteId}`
                );

                await handleMessagingForUpdatedSiteResource(
                    existingSiteResource,
                    updatedSiteResource,
                    { siteId: site.siteId, orgId: site.orgId },
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
    site: { siteId: number; orgId: string },
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
            const oldTarget = await generateSubnetProxyTargetV2(
                existingSiteResource,
                mergedAllClients
            );
            const newTarget = await generateSubnetProxyTargetV2(
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
                .where(
                    and(
                        eq(
                            clientSiteResourcesAssociationsCache.clientId,
                            client.clientId
                        ),
                        eq(siteResources.siteId, site.siteId),
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
                    updatedSiteResource.siteId,
                    destinationChanged
                        ? {
                              oldRemoteSubnets: !oldDestinationStillInUseByASite
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
