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
    userSiteResources,
    primaryDb
} from "@server/db";
import { isLicensedOrSubscribed } from "#dynamic/lib/isLicencedOrSubscribed";
import { TierFeature, tierMatrix } from "@server/lib/billing/tierMatrix";
import { validateAndConstructDomain } from "@server/lib/domainUtils";
import response from "@server/lib/response";
import { eq, and, ne, inArray } from "drizzle-orm";
import { OpenAPITags, registry } from "@server/openApi";
import { updatePeerData, updateTargets } from "@server/routers/client/targets";
import {
    generateAliasConfig,
    generateRemoteSubnets,
    generateSubnetProxyTargetV2,
    isIpInCidr,
    portRangeStringSchema
} from "@server/lib/ip";
import {
    getClientSiteResourceAccess,
    rebuildClientAssociationsFromSiteResource
} from "@server/lib/rebuildClientAssociations";
import logger from "@server/logger";
import HttpCode from "@server/types/HttpCode";
import { NextFunction, Request, Response } from "express";
import createHttpError from "http-errors";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const updateSiteResourceParamsSchema = z.strictObject({
    siteResourceId: z.coerce.number().int().positive()
});

const updateSiteResourceSchema = z
    .strictObject({
        name: z.string().min(1).max(255).optional(),
        siteIds: z.array(z.int()).optional(),
        siteId: z.int().positive().optional(),
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
        mode: z.enum(["host", "cidr", "http", "ssh"]).optional(),
        ssl: z.boolean().optional(),
        scheme: z.enum(["http", "https"]).nullish(),
        destinationPort: z.int().positive().nullish(),
        destination: z.string().min(1).optional(),
        enabled: z.boolean().optional(),
        alias: z
            .string()
            .regex(
                /^(?:[a-zA-Z0-9*?](?:[a-zA-Z0-9*?-]{0,61}[a-zA-Z0-9*?])?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/,
                "Alias must be a fully qualified domain name with optional wildcards (e.g., example.internal, *.example.internal, host-0?.example.internal)"
            )
            .nullish()
            .openapi({
                description:
                    "Fully qualified domain name with optional wildcards, e.g., example.internal, *.example.internal, or host-0?.example.internal",
                example: "service.example.internal"
            }),
        userIds: z.array(z.string()),
        roleIds: z.array(z.int()),
        clientIds: z.array(z.int()),
        tcpPortRangeString: portRangeStringSchema,
        udpPortRangeString: portRangeStringSchema,
        disableIcmp: z.boolean().optional(),
        authDaemonPort: z.int().positive().nullish(),
        authDaemonMode: z.enum(["site", "remote", "native"]).optional(),
        pamMode: z.enum(["passthrough", "push"]).optional(),
        domainId: z.string().optional(),
        subdomain: z.string().optional()
    })
    .strict()
    .refine(
        (data) => {
            if (
                (data.mode === "host" || data.mode == "ssh") &&
                data.destination
            ) {
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
            } else if (data.mode === "cidr" && data.destination) {
                // Check if it's a valid CIDR (v4 or v6)
                const isValidCIDR = z
                    .union([z.cidrv4(), z.cidrv6()])
                    .safeParse(data.destination).success;
                return isValidCIDR;
            } else if (data.mode === "http") {
                // we have to have a domainId defined
                if (!data.domainId) {
                    return false;
                }
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
            if (data.mode === "http") {
                return (
                    data.scheme !== undefined &&
                    data.scheme !== null &&
                    data.destinationPort !== undefined &&
                    data.destinationPort !== null &&
                    data.destinationPort >= 1 &&
                    data.destinationPort <= 65535
                );
            } else if (data.mode === "ssh") {
                // destinationPort is optional for native mode; allow null/undefined
                return (
                    data.destinationPort == null ||
                    (data.destinationPort >= 1 && data.destinationPort <= 65535)
                );
            }
            return true;
        },
        {
            message:
                "HTTP mode requires scheme (http or https) and a valid destination port"
        }
    )
    .refine(
        (data) => {
            // destination is only optional for ssh mode with native authDaemonMode
            if (data.mode === "ssh" && data.authDaemonMode === "native") {
                return true;
            }
            return (
                data.destination !== undefined && data.destination.trim() !== ""
            );
        },
        {
            message:
                "Destination is required unless mode is ssh with authDaemonMode native"
        }
    )
    .refine(
        (data) => {
            return (
                (data.siteIds !== undefined && data.siteIds.length > 0) ||
                data.siteId !== undefined
            );
        },
        {
            message: "At least one of siteIds or siteId must be provided"
        }
    )
    .refine(
        (data) => {
            if (data.mode !== "ssh") return true;
            const isSingleSiteMode =
                data.authDaemonMode === "native" ||
                (data.pamMode === "push" && data.authDaemonMode === "site") ||
                (data.pamMode === "push" && data.authDaemonMode === undefined);
            if (!isSingleSiteMode) return true;
            const effectiveSiteIds = [
                ...(data.siteIds ?? []),
                ...(data.siteId !== undefined ? [data.siteId] : [])
            ];
            const uniqueSiteIds = new Set(effectiveSiteIds);
            return uniqueSiteIds.size <= 1;
        },
        {
            message: "Only one site is allowed for this SSH daemon mode"
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
    responses: {
        200: {
            description: "Successful response",
            content: {
                "application/json": {
                    schema: z.object({
                        data: z.record(z.string(), z.any()).nullable(),
                        success: z.boolean(),
                        error: z.boolean(),
                        message: z.string(),
                        status: z.number()
                    })
                }
            }
        }
    }
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
            siteIds: siteIdsInput = [], // because it can change
            siteId,
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
            pamMode,
            domainId,
            subdomain
        } = parsedBody.data;

        // Backward compatibility: merge deprecated siteId into siteIds array
        const siteIds = [...siteIdsInput];
        if (siteId !== undefined && !siteIds.includes(siteId)) {
            siteIds.push(siteId);
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

        if (mode == "http") {
            const hasHttpFeature = await isLicensedOrSubscribed(
                existingSiteResource.orgId,
                tierMatrix[TierFeature.AdvancedPrivateResources]
            );
            if (!hasHttpFeature) {
                return next(
                    createHttpError(
                        HttpCode.FORBIDDEN,
                        "HTTP private resources are not included in your current plan. Please upgrade."
                    )
                );
            }
        }

        const isLicensedSshPam = await isLicensedOrSubscribed(
            existingSiteResource.orgId,
            tierMatrix.advancedPrivateResources
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
            );

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

        const existingSiteIds = existingSiteResource.networkId
            ? await db
                  .select()
                  .from(siteNetworks)
                  .where(
                      eq(siteNetworks.networkId, existingSiteResource.networkId)
                  )
            : [];
        const existingSiteIdSet = new Set(existingSiteIds.map((s) => s.siteId));

        let fullDomain: string | null = null;
        let finalSubdomain: string | null = null;
        if (domainId) {
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

            // make sure the full domain is unique
            const [existingDomain] = await db
                .select()
                .from(siteResources)
                .where(eq(siteResources.fullDomain, fullDomain));

            if (
                existingDomain &&
                existingDomain.siteResourceId !==
                    existingSiteResource.siteResourceId
            ) {
                return next(
                    createHttpError(
                        HttpCode.CONFLICT,
                        "Resource with that domain already exists"
                    )
                );
            }
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
            // Update the site resource
            const sshPamSet =
                isLicensedSshPam &&
                (authDaemonPort !== undefined ||
                    authDaemonMode !== undefined ||
                    pamMode !== undefined)
                    ? {
                          ...(authDaemonPort !== undefined && {
                              authDaemonPort
                          }),
                          ...(authDaemonMode !== undefined && {
                              authDaemonMode
                          }),
                          ...(pamMode !== undefined && {
                              pamMode
                          })
                      }
                    : {};
            let tcpPortRangeStringAdjusted = tcpPortRangeString;
            if (mode === "http") {
                tcpPortRangeStringAdjusted = "443,80";
            } else if (mode === "ssh") {
                tcpPortRangeStringAdjusted = destinationPort
                    ? destinationPort.toString()
                    : "22";
            }

            [updatedSiteResource] = await trx
                .update(siteResources)
                .set({
                    name: name,
                    niceId: niceId,
                    mode: mode,
                    scheme,
                    ssl,
                    destination: destination,
                    destinationPort: destinationPort,
                    enabled: enabled,
                    alias: alias ? alias.trim() : null,
                    tcpPortRangeString: tcpPortRangeStringAdjusted,
                    udpPortRangeString:
                        mode == "http" || mode == "ssh"
                            ? ""
                            : udpPortRangeString,
                    disableIcmp:
                        disableIcmp ||
                        (mode == "http" || mode == "ssh" ? true : false),
                    domainId,
                    subdomain: finalSubdomain,
                    fullDomain,
                    ...sshPamSet
                })
                .where(and(eq(siteResources.siteResourceId, siteResourceId)))
                .returning();

            //////////////////// update the associations ////////////////////

            // delete the site - site resources associations
            await trx
                .delete(siteNetworks)
                .where(
                    eq(siteNetworks.networkId, updatedSiteResource.networkId!)
                );

            for (const siteId of siteIds) {
                await trx.insert(siteNetworks).values({
                    siteId: siteId,
                    networkId: updatedSiteResource.networkId!
                });
            }

            await trx
                .delete(clientSiteResources)
                .where(eq(clientSiteResources.siteResourceId, siteResourceId));

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
                .where(eq(userSiteResources.siteResourceId, siteResourceId));

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
                        eq(roleSiteResources.siteResourceId, siteResourceId),
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
        });

        if (!updatedSiteResource) {
            throw new Error("No updated resource found after update");
        }

        rebuildClientAssociationsFromSiteResource(updatedSiteResource).catch(
            (e) => {
                logger.error(
                    `Failed to rebuild client associations for site resource ${siteResourceId}. Error: ${e}`
                );
            }
        );

        handleMessagingForUpdatedSiteResource(
            existingSiteResource,
            updatedSiteResource,
            Array.from(existingSiteIdSet).map((siteId: number) => ({
                // we already added to the new sites above in the rebuild function so we only need to update the ones that did not change
                siteId,
                orgId: existingSiteResource.orgId
            }))
        ).catch((e) => {
            logger.error(
                `Failed to handle messaging for updated site resource ${siteResourceId}. Error: ${e}`
            );
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
    sites: { siteId: number; orgId: string }[]
) {
    const trx = primaryDb;
    logger.debug(
        "handleMessagingForUpdatedSiteResource: existingSiteResource is: ",
        existingSiteResource
    );
    logger.debug(
        "handleMessagingForUpdatedSiteResource: updatedSiteResource is: ",
        updatedSiteResource
    );

    const { sitesList, mergedAllClients, mergedAllClientIds } =
        await getClientSiteResourceAccess(
            existingSiteResource || updatedSiteResource,
            trx
        );

    const siteIds = sites.map((site) => site.siteId);

    // after everything is rebuilt above we still need to update the targets and remote subnets if the destination changed
    const destinationChanged =
        existingSiteResource &&
        existingSiteResource.destination !== updatedSiteResource.destination;
    const destinationPortChanged =
        existingSiteResource &&
        existingSiteResource.destinationPort !==
            updatedSiteResource.destinationPort;
    const aliasChanged =
        existingSiteResource &&
        existingSiteResource.alias !== updatedSiteResource.alias;
    const fullDomainChanged =
        existingSiteResource &&
        existingSiteResource.fullDomain !== updatedSiteResource.fullDomain;
    const sslChanged =
        existingSiteResource &&
        existingSiteResource.ssl !== updatedSiteResource.ssl;
    const portRangesChanged =
        existingSiteResource &&
        (existingSiteResource.tcpPortRangeString !==
            updatedSiteResource.tcpPortRangeString ||
            existingSiteResource.udpPortRangeString !==
                updatedSiteResource.udpPortRangeString ||
            existingSiteResource.disableIcmp !==
                updatedSiteResource.disableIcmp);

    // if the existingSiteResource is undefined (new resource) we don't need to do anything here, the rebuild above handled it all

    if (
        destinationChanged ||
        aliasChanged ||
        fullDomainChanged ||
        sslChanged ||
        portRangesChanged ||
        destinationPortChanged
    ) {
        const newtsForSites =
            siteIds.length > 0
                ? await trx
                      .select()
                      .from(newts)
                      .where(inArray(newts.siteId, siteIds))
                : [];
        const newtBySiteId = new Map(
            newtsForSites.map((newt) => [newt.siteId, newt])
        );

        const oldDestinationStillInUseClientSitePairs = new Set<string>();
        if (
            existingSiteResource?.destination &&
            siteIds.length > 0 &&
            mergedAllClientIds.length > 0
        ) {
            const oldDestinationStillInUseRows = await trx
                .select({
                    clientId: clientSiteResourcesAssociationsCache.clientId,
                    siteId: siteNetworks.siteId
                })
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
                        inArray(
                            clientSiteResourcesAssociationsCache.clientId,
                            mergedAllClientIds
                        ),
                        inArray(siteNetworks.siteId, siteIds),
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

            for (const row of oldDestinationStillInUseRows) {
                oldDestinationStillInUseClientSitePairs.add(
                    `${row.clientId}:${row.siteId}`
                );
            }
        }

        const shouldUpdateTargets =
            destinationChanged ||
            sslChanged ||
            portRangesChanged ||
            fullDomainChanged ||
            destinationPortChanged;
        const oldTargets = shouldUpdateTargets
            ? await generateSubnetProxyTargetV2(
                  existingSiteResource,
                  mergedAllClients
              )
            : [];
        const newTargets = shouldUpdateTargets
            ? await generateSubnetProxyTargetV2(
                  updatedSiteResource,
                  mergedAllClients
              )
            : [];

        for (const site of sites) {
            const newt = newtBySiteId.get(site.siteId);

            if (!newt) {
                throw new Error(
                    "Newt not found for site during site resource update"
                );
            }

            // Only update targets on newt if these items change
            if (shouldUpdateTargets) {
                await updateTargets(
                    newt.newtId,
                    {
                        oldTargets: oldTargets ? oldTargets : [],
                        newTargets: newTargets ? newTargets : []
                    },
                    newt.version
                );
            }

            const olmJobs: Promise<void>[] = [];
            for (const client of mergedAllClients) {
                // does this client have access to another resource on this site that has the same destination still? if so we dont want to remove it from their olm yet
                if (!existingSiteResource.destination) {
                    continue;
                }

                const oldDestinationStillInUseByASite =
                    oldDestinationStillInUseClientSitePairs.has(
                        `${client.clientId}:${site.siteId}`
                    );

                // we also need to update the remote subnets on the olms for each client that has access to this site
                olmJobs.push(
                    updatePeerData(
                        // TODO: THIS SHOULD BE UPDATED TO WORK I A BATCH
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
                        aliasChanged || fullDomainChanged // the full domain is sent down as an alias
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
