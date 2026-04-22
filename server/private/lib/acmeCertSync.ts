/*
 * This file is part of a proprietary work.
 *
 * Copyright (c) 2025-2026 Fossorial, Inc.
 * All rights reserved.
 *
 * This file is licensed under the Fossorial Commercial License.
 * You may not use this file except in compliance with the License.
 * Unauthorized use, copying, modification, or distribution is strictly prohibited.
 *
 * This file is not licensed under the AGPLv3.
 */

import fs from "fs";
import crypto from "crypto";
import {
    certificates,
    clients,
    clientSiteResourcesAssociationsCache,
    db,
    domains,
    newts,
    siteNetworks,
    SiteResource,
    siteResources
} from "@server/db";
import { and, eq } from "drizzle-orm";
import { encrypt, decrypt } from "@server/lib/crypto";
import logger from "@server/logger";
import privateConfig from "#private/lib/config";
import config from "@server/lib/config";
import {
    generateSubnetProxyTargetV2,
    SubnetProxyTargetV2
} from "@server/lib/ip";
import { updateTargets } from "@server/routers/client/targets";
import cache from "#private/lib/cache";
import { build } from "@server/build";

interface AcmeCert {
    domain: { main: string; sans?: string[] };
    certificate: string;
    key: string;
    Store: string;
}

interface AcmeJson {
    [resolver: string]: {
        Certificates: AcmeCert[];
    };
}

async function pushCertUpdateToAffectedNewts(
    domain: string,
    domainId: string | null,
    oldCertPem: string | null,
    oldKeyPem: string | null
): Promise<void> {
    // Find all SSL-enabled HTTP site resources that use this cert's domain
    let affectedResources: SiteResource[] = [];

    if (domainId) {
        affectedResources = await db
            .select()
            .from(siteResources)
            .where(
                and(
                    eq(siteResources.domainId, domainId),
                    eq(siteResources.ssl, true)
                )
            );
    } else {
        // Fallback: match by exact fullDomain when no domainId is available
        affectedResources = await db
            .select()
            .from(siteResources)
            .where(
                and(
                    eq(siteResources.fullDomain, domain),
                    eq(siteResources.ssl, true)
                )
            );
    }

    if (affectedResources.length === 0) {
        logger.debug(
            `acmeCertSync: no affected site resources for cert domain "${domain}"`
        );
        return;
    }

    logger.debug(
        `acmeCertSync: pushing cert update to ${affectedResources.length} affected site resource(s) for domain "${domain}"`
    );

    for (const resource of affectedResources) {
        try {
            // Get all sites for this resource via siteNetworks
            const resourceSiteRows = resource.networkId
                ? await db
                      .select({ siteId: siteNetworks.siteId })
                      .from(siteNetworks)
                      .where(eq(siteNetworks.networkId, resource.networkId))
                : [];

            if (resourceSiteRows.length === 0) {
                logger.debug(
                    `acmeCertSync: no sites for resource ${resource.siteResourceId}, skipping`
                );
                continue;
            }

            // Get all clients with access to this resource
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

            if (resourceClients.length === 0) {
                logger.debug(
                    `acmeCertSync: no clients for resource ${resource.siteResourceId}, skipping`
                );
                continue;
            }

            // Invalidate the cert cache so generateSubnetProxyTargetV2 fetches fresh data
            if (resource.fullDomain) {
                await cache.del(`cert:${resource.fullDomain}`);
            }

            // Generate target once - same cert applies to all sites for this resource
            const newTargets = await generateSubnetProxyTargetV2(
                resource,
                resourceClients
            );

            if (!newTargets) {
                logger.debug(
                    `acmeCertSync: could not generate target for resource ${resource.siteResourceId}, skipping`
                );
                continue;
            }

            // Construct the old targets - same routing shape but with the previous cert/key.
            // The newt only uses destPrefix/sourcePrefixes for removal, but we keep the
            // semantics correct so the update message accurately reflects what changed.
            const oldTargets: SubnetProxyTargetV2[] = newTargets.map((t) => ({
                ...t,
                tlsCert: oldCertPem ?? undefined,
                tlsKey: oldKeyPem ?? undefined
            }));

            // Push update to each site's newt
            for (const { siteId } of resourceSiteRows) {
                const [newt] = await db
                    .select()
                    .from(newts)
                    .where(eq(newts.siteId, siteId))
                    .limit(1);

                if (!newt) {
                    logger.debug(
                        `acmeCertSync: no newt found for site ${siteId}, skipping resource ${resource.siteResourceId}`
                    );
                    continue;
                }

                await updateTargets(
                    newt.newtId,
                    { oldTargets: oldTargets, newTargets: newTargets },
                    newt.version
                );

                logger.debug(
                    `acmeCertSync: pushed cert update to newt for site ${siteId}, resource ${resource.siteResourceId}`
                );
            }
        } catch (err) {
            logger.error(
                `acmeCertSync: error pushing cert update for resource ${resource?.siteResourceId}: ${err}`
            );
        }
    }
}

async function findDomainId(certDomain: string): Promise<string | null> {
    // Strip wildcard prefix before lookup (*.example.com -> example.com)
    const lookupDomain = certDomain.startsWith("*.")
        ? certDomain.slice(2)
        : certDomain;

    // 1. Exact baseDomain match (any domain type)
    const exactMatch = await db
        .select({ domainId: domains.domainId })
        .from(domains)
        .where(eq(domains.baseDomain, lookupDomain))
        .limit(1);

    if (exactMatch.length > 0) {
        return exactMatch[0].domainId;
    }

    // 2. Walk up the domain hierarchy looking for a wildcard-type domain whose
    //    baseDomain is a suffix of the cert domain. e.g. cert "sub.example.com"
    //    matches a wildcard domain with baseDomain "example.com".
    const parts = lookupDomain.split(".");
    for (let i = 1; i < parts.length; i++) {
        const candidate = parts.slice(i).join(".");
        if (!candidate) continue;

        const wildcardMatch = await db
            .select({ domainId: domains.domainId })
            .from(domains)
            .where(
                and(
                    eq(domains.baseDomain, candidate),
                    eq(domains.type, "wildcard")
                )
            )
            .limit(1);

        if (wildcardMatch.length > 0) {
            return wildcardMatch[0].domainId;
        }
    }

    return null;
}

function extractFirstCert(pemBundle: string): string | null {
    const match = pemBundle.match(
        /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/
    );
    return match ? match[0] : null;
}

async function syncAcmeCerts(
    acmeJsonPath: string,
    resolver: string
): Promise<void> {
    let raw: string;
    try {
        raw = fs.readFileSync(acmeJsonPath, "utf8");
    } catch (err) {
        logger.debug(`acmeCertSync: could not read ${acmeJsonPath}: ${err}`);
        return;
    }

    let acmeJson: AcmeJson;
    try {
        acmeJson = JSON.parse(raw);
    } catch (err) {
        logger.debug(`acmeCertSync: could not parse acme.json: ${err}`);
        return;
    }

    const resolverData = acmeJson[resolver];
    if (!resolverData || !Array.isArray(resolverData.Certificates)) {
        logger.debug(
            `acmeCertSync: no certificates found for resolver "${resolver}"`
        );
        return;
    }

    for (const cert of resolverData.Certificates) {
        const domain = cert.domain?.main;

        if (!domain) {
            logger.debug(`acmeCertSync: skipping cert with missing domain`);
            continue;
        }

        if (!cert.certificate || !cert.key) {
            logger.debug(
                `acmeCertSync: skipping cert for ${domain} - empty certificate or key field`
            );
            continue;
        }

        const certPem = Buffer.from(cert.certificate, "base64").toString(
            "utf8"
        );
        const keyPem = Buffer.from(cert.key, "base64").toString("utf8");

        if (!certPem.trim() || !keyPem.trim()) {
            logger.debug(
                `acmeCertSync: skipping cert for ${domain} - blank PEM after base64 decode`
            );
            continue;
        }

        // Check if cert already exists in DB
        const existing = await db
            .select()
            .from(certificates)
            .where(eq(certificates.domain, domain))
            .limit(1);

        let oldCertPem: string | null = null;
        let oldKeyPem: string | null = null;

        if (existing.length > 0 && existing[0].certFile) {
            try {
                const storedCertPem = decrypt(
                    existing[0].certFile,
                    config.getRawConfig().server.secret!
                );
                if (storedCertPem === certPem) {
                    logger.debug(
                        `acmeCertSync: cert for ${domain} is unchanged, skipping`
                    );
                    continue;
                }
                // Cert has changed; capture old values so we can send a correct
                // update message to the newt after the DB write.
                oldCertPem = storedCertPem;
                if (existing[0].keyFile) {
                    try {
                        oldKeyPem = decrypt(
                            existing[0].keyFile,
                            config.getRawConfig().server.secret!
                        );
                    } catch (keyErr) {
                        logger.debug(
                            `acmeCertSync: could not decrypt stored key for ${domain}: ${keyErr}`
                        );
                    }
                }
            } catch (err) {
                // Decryption failure means we should proceed with the update
                logger.debug(
                    `acmeCertSync: could not decrypt stored cert for ${domain}, will update: ${err}`
                );
            }
        }

        // Parse cert expiry from the first cert in the PEM bundle
        let expiresAt: number | null = null;
        const firstCertPem = extractFirstCert(certPem);
        if (firstCertPem) {
            try {
                const x509 = new crypto.X509Certificate(firstCertPem);
                expiresAt = Math.floor(new Date(x509.validTo).getTime() / 1000);
            } catch (err) {
                logger.debug(
                    `acmeCertSync: could not parse cert expiry for ${domain}: ${err}`
                );
            }
        }

        const wildcard = domain.startsWith("*.");
        const encryptedCert = encrypt(
            certPem,
            config.getRawConfig().server.secret!
        );
        const encryptedKey = encrypt(
            keyPem,
            config.getRawConfig().server.secret!
        );
        const now = Math.floor(Date.now() / 1000);

        const domainId = await findDomainId(domain);
        if (domainId) {
            logger.debug(
                `acmeCertSync: resolved domainId "${domainId}" for cert domain "${domain}"`
            );
        } else {
            logger.debug(
                `acmeCertSync: no matching domain record found for cert domain "${domain}"`
            );
        }

        if (existing.length > 0) {
            await db
                .update(certificates)
                .set({
                    certFile: encryptedCert,
                    keyFile: encryptedKey,
                    status: "valid",
                    expiresAt,
                    updatedAt: now,
                    wildcard,
                    ...(domainId !== null && { domainId })
                })
                .where(eq(certificates.domain, domain));

            logger.debug(
                `acmeCertSync: updated certificate for ${domain} (expires ${expiresAt ? new Date(expiresAt * 1000).toISOString() : "unknown"})`
            );

            await pushCertUpdateToAffectedNewts(
                domain,
                domainId,
                oldCertPem,
                oldKeyPem
            );
        } else {
            await db.insert(certificates).values({
                domain,
                domainId,
                certFile: encryptedCert,
                keyFile: encryptedKey,
                status: "valid",
                expiresAt,
                createdAt: now,
                updatedAt: now,
                wildcard
            });

            logger.debug(
                `acmeCertSync: inserted new certificate for ${domain} (expires ${expiresAt ? new Date(expiresAt * 1000).toISOString() : "unknown"})`
            );

            // For a brand-new cert, push to any SSL resources that were waiting for it
            await pushCertUpdateToAffectedNewts(domain, domainId, null, null);
        }
    }
}

export function initAcmeCertSync(): void {
    if (build == "saas") {
        logger.debug(`acmeCertSync: skipping ACME cert sync in SaaS build`);
        return;
    }

    const privateConfigData = privateConfig.getRawPrivateConfig();

    if (!privateConfigData.flags?.enable_acme_cert_sync) {
        logger.debug(
            `acmeCertSync: ACME cert sync is disabled by config flag, skipping`
        );
        return;
    }

    if (privateConfigData.flags.use_pangolin_dns) {
        logger.debug(
            `acmeCertSync: ACME cert sync requires use_pangolin_dns flag to be disabled, skipping`
        );
        return;
    }

    const acmeJsonPath =
        privateConfigData.acme?.acme_json_path ??
        "config/letsencrypt/acme.json";
    const resolver = privateConfigData.acme?.resolver ?? "letsencrypt";
    const intervalMs = privateConfigData.acme?.sync_interval_ms ?? 5000;

    logger.debug(
        `acmeCertSync: starting ACME cert sync from "${acmeJsonPath}" using resolver "${resolver}" every ${intervalMs}ms`
    );

    // Run immediately on init, then on the configured interval
    syncAcmeCerts(acmeJsonPath, resolver).catch((err) => {
        logger.error(`acmeCertSync: error during initial sync: ${err}`);
    });

    setInterval(() => {
        syncAcmeCerts(acmeJsonPath, resolver).catch((err) => {
            logger.error(`acmeCertSync: error during sync: ${err}`);
        });
    }, intervalMs);
}
