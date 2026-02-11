/*
 * This file is part of a proprietary work.
 *
 * Copyright (c) 2025 Fossorial, Inc.
 * All rights reserved.
 *
 * This file is licensed under the Fossorial Commercial License.
 * You may not use this file except in compliance with the License.
 * Unauthorized use, copying, modification, or distribution is strictly prohibited.
 *
 * This file is not licensed under the AGPLv3.
 */

import { SubscriptionType } from "./hooks/getSubType";
import { TierFeature, tierMatrix } from "@server/lib/billing/tierMatrix";
import { Tier } from "@server/types/Tiers";
import logger from "@server/logger";
import { db, idp, idpOrg, loginPage, loginPageBranding, loginPageBrandingOrg, loginPageOrg, orgs, resources, roles } from "@server/db";
import { eq } from "drizzle-orm";

export async function handleTierChange(
    orgId: string,
    newTier: SubscriptionType | null,
    previousTier?: SubscriptionType | null
): Promise<void> {
    logger.info(
        `Handling tier change for org ${orgId}: ${previousTier || "none"} -> ${newTier || "free"}`
    );

    // License subscriptions are handled separately and don't use the tier matrix
    if (newTier === "license") {
        logger.debug(
            `New tier is license for org ${orgId}, no feature lifecycle handling needed`
        );
        return;
    }

    // If newTier is null, treat as free tier - disable all features
    if (newTier === null) {
        logger.info(
            `Org ${orgId} is reverting to free tier, disabling all paid features`
        );
        // Disable all features in the tier matrix
        for (const [featureKey] of Object.entries(tierMatrix)) {
            const feature = featureKey as TierFeature;
            logger.info(
                `Feature ${feature} is not available in free tier for org ${orgId}. Disabling...`
            );
            await disableFeature(orgId, feature);
        }
        logger.info(
            `Completed free tier feature lifecycle handling for org ${orgId}`
        );
        return;
    }

    // Get the tier (cast as Tier since we've ruled out "license" and null)
    const tier = newTier as Tier;

    // Check each feature in the tier matrix
    for (const [featureKey, allowedTiers] of Object.entries(tierMatrix)) {
        const feature = featureKey as TierFeature;
        const isFeatureAvailable = allowedTiers.includes(tier);

        if (!isFeatureAvailable) {
            logger.info(
                `Feature ${feature} is not available in tier ${tier} for org ${orgId}. Disabling...`
            );
            await disableFeature(orgId, feature);
        } else {
            logger.debug(
                `Feature ${feature} is available in tier ${tier} for org ${orgId}`
            );
        }
    }

    logger.info(
        `Completed tier change feature lifecycle handling for org ${orgId}`
    );
}

async function disableFeature(
    orgId: string,
    feature: TierFeature
): Promise<void> {
    try {
        switch (feature) {
            case TierFeature.OrgOidc:
                await disableOrgOidc(orgId);
                break;

            case TierFeature.LoginPageDomain:
                await disableLoginPageDomain(orgId);
                break;

            case TierFeature.DeviceApprovals:
                await disableDeviceApprovals(orgId);
                break;

            case TierFeature.LoginPageBranding:
                await disableLoginPageBranding(orgId);
                break;

            case TierFeature.LogExport:
                await disableLogExport(orgId);
                break;

            case TierFeature.AccessLogs:
                await disableAccessLogs(orgId);
                break;

            case TierFeature.ActionLogs:
                await disableActionLogs(orgId);
                break;

            case TierFeature.RotateCredentials:
                await disableRotateCredentials(orgId);
                break;

            case TierFeature.MaintencePage:
                await disableMaintencePage(orgId);
                break;

            case TierFeature.DevicePosture:
                await disableDevicePosture(orgId);
                break;

            case TierFeature.TwoFactorEnforcement:
                await disableTwoFactorEnforcement(orgId);
                break;

            case TierFeature.SessionDurationPolicies:
                await disableSessionDurationPolicies(orgId);
                break;

            case TierFeature.PasswordExpirationPolicies:
                await disablePasswordExpirationPolicies(orgId);
                break;

            case TierFeature.AutoProvisioning:
                await disableAutoProvisioning(orgId);
                break;

            default:
                logger.warn(
                    `Unknown feature ${feature} for org ${orgId}, skipping`
                );
        }

        logger.info(
            `Successfully disabled feature ${feature} for org ${orgId}`
        );
    } catch (error) {
        logger.error(
            `Error disabling feature ${feature} for org ${orgId}:`,
            error
        );
        throw error;
    }
}

async function disableOrgOidc(orgId: string): Promise<void> {}

async function disableDeviceApprovals(orgId: string): Promise<void> {
    await db
        .update(roles)
        .set({ requireDeviceApproval: false })
        .where(eq(roles.orgId, orgId));

    logger.info(`Disabled device approvals on all roles for org ${orgId}`);
}

async function disableLoginPageBranding(orgId: string): Promise<void> {
    const [existingBranding] = await db
        .select()
        .from(loginPageBrandingOrg)
        .where(eq(loginPageBrandingOrg.orgId, orgId));

    if (existingBranding) {
        await db
            .delete(loginPageBranding)
            .where(
                eq(
                    loginPageBranding.loginPageBrandingId,
                    existingBranding.loginPageBrandingId
                )
            );

        logger.info(`Disabled login page branding for org ${orgId}`);
    }
}

async function disableLoginPageDomain(orgId: string): Promise<void> {
    const [existingLoginPage] = await db
        .select()
        .from(loginPageOrg)
        .where(eq(loginPageOrg.orgId, orgId))
        .innerJoin(
            loginPage,
            eq(loginPage.loginPageId, loginPageOrg.loginPageId)
        );

    if (existingLoginPage) {
        await db
            .delete(loginPageOrg)
            .where(eq(loginPageOrg.orgId, orgId));

        await db
            .delete(loginPage)
            .where(
                eq(
                    loginPage.loginPageId,
                    existingLoginPage.loginPageOrg.loginPageId
                )
            );

        logger.info(`Disabled login page domain for org ${orgId}`);
    }
}

async function disableLogExport(orgId: string): Promise<void> {}

async function disableAccessLogs(orgId: string): Promise<void> {
    await db
        .update(orgs)
        .set({ settingsLogRetentionDaysAccess: 0 })
        .where(eq(orgs.orgId, orgId));

    logger.info(`Disabled access logs for org ${orgId}`);
}

async function disableActionLogs(orgId: string): Promise<void> {
    await db
        .update(orgs)
        .set({ settingsLogRetentionDaysAction: 0 })
        .where(eq(orgs.orgId, orgId));

    logger.info(`Disabled action logs for org ${orgId}`);
}

async function disableRotateCredentials(orgId: string): Promise<void> {}

async function disableMaintencePage(orgId: string): Promise<void> {
    await db
        .update(resources)
        .set({
            maintenanceModeEnabled: false
        })
        .where(eq(resources.orgId, orgId));

    logger.info(`Disabled maintenance page on all resources for org ${orgId}`);
}

async function disableDevicePosture(orgId: string): Promise<void> {}

async function disableTwoFactorEnforcement(orgId: string): Promise<void> {
    await db
        .update(orgs)
        .set({ requireTwoFactor: false })
        .where(eq(orgs.orgId, orgId));

    logger.info(`Disabled two-factor enforcement for org ${orgId}`);
}

async function disableSessionDurationPolicies(orgId: string): Promise<void> {
    await db
        .update(orgs)
        .set({ maxSessionLengthHours: null })
        .where(eq(orgs.orgId, orgId));

    logger.info(`Disabled session duration policies for org ${orgId}`);
}

async function disablePasswordExpirationPolicies(orgId: string): Promise<void> {
    await db
        .update(orgs)
        .set({ passwordExpiryDays: null })
        .where(eq(orgs.orgId, orgId));

    logger.info(`Disabled password expiration policies for org ${orgId}`);
}

async function disableAutoProvisioning(orgId: string): Promise<void> {
    // Get all IDP IDs for this org through the idpOrg join table
    const orgIdps = await db
        .select({ idpId: idpOrg.idpId })
        .from(idpOrg)
        .where(eq(idpOrg.orgId, orgId));

    // Update autoProvision to false for all IDPs in this org
    for (const { idpId } of orgIdps) {
        await db
            .update(idp)
            .set({ autoProvision: false })
            .where(eq(idp.idpId, idpId));
    }
}
