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

import logger from "@server/logger";
import { processAlerts } from "../processAlerts";
import { db, sites, statusHistory, targetHealthCheck, Transaction } from "@server/db";
import { and, eq, inArray } from "drizzle-orm";
import { fireHealthCheckUnhealthyAlert } from "./healthCheckEvents";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fire a `site_online` alert for the given site.
 *
 * Call this after the site has been confirmed reachable / connected so that
 * any matching `alertRules` can dispatch their email and webhook actions.
 *
 * @param orgId    - Organisation that owns the site.
 * @param siteId   - Numeric primary key of the site.
 * @param siteName - Human-readable name shown in notifications (optional).
 * @param extra    - Any additional key/value pairs to include in the payload.
 */
export async function fireSiteOnlineAlert(
    orgId: string,
    siteId: number,
    siteName?: string,
    extra?: Record<string, unknown>,
    trx: Transaction | typeof db = db
): Promise<void> {
    try {
        await trx.insert(statusHistory).values({
            entityType: "site",
            entityId: siteId,
            orgId: orgId,
            status: "online",
            timestamp: Math.floor(Date.now() / 1000)
        });

        await processAlerts({
            eventType: "site_online",
            orgId,
            siteId,
            data: {
                ...(siteName != null ? { siteName } : {}),
                ...extra
            }
        });
        await processAlerts({
            eventType: "site_toggle",
            orgId,
            siteId,
            data: {
                siteId,
                status: "online",
                ...(siteName != null ? { siteName } : {}),
                ...extra
            }
        });
    } catch (err) {
        logger.error(
            `fireSiteOnlineAlert: unexpected error for siteId ${siteId}`,
            err
        );
    }
}

/**
 * Fire a `site_offline` alert for the given site.
 *
 * Call this after the site has been detected as unreachable / disconnected so
 * that any matching `alertRules` can dispatch their email and webhook actions.
 *
 * @param orgId    - Organisation that owns the site.
 * @param siteId   - Numeric primary key of the site.
 * @param siteName - Human-readable name shown in notifications (optional).
 * @param extra    - Any additional key/value pairs to include in the payload.
 */
export async function fireSiteOfflineAlert(
    orgId: string,
    siteId: number,
    siteName?: string,
    extra?: Record<string, unknown>,
    trx: Transaction | typeof db = db
): Promise<void> {
    try {
        await trx.insert(statusHistory).values({
            entityType: "site",
            entityId: siteId,
            orgId: orgId,
            status: "offline",
            timestamp: Math.floor(Date.now() / 1000)
        });

        const unhealthyHealthChecks = await trx
            .update(targetHealthCheck)
            .set({ hcHealth: "unhealthy" })
            .where(
                and(
                    eq(targetHealthCheck.orgId, orgId),
                    eq(targetHealthCheck.siteId, siteId)
                )
            )
            .returning();

        for (const healthCheck of unhealthyHealthChecks) {
            logger.info(
                `Marking health check ${healthCheck.targetHealthCheckId} unhealthy due to site ${siteId} being marked offline`
            );

            await fireHealthCheckUnhealthyAlert(
                healthCheck.orgId,
                healthCheck.targetHealthCheckId,
                healthCheck.name,
                undefined,
                undefined,
                true,
                trx
            );
        }

        await processAlerts({
            eventType: "site_offline",
            orgId,
            siteId,
            data: {
                ...(siteName != null ? { siteName } : {}),
                ...extra
            }
        });
        await processAlerts({
            eventType: "site_toggle",
            orgId,
            siteId,
            data: {
                siteId,
                status: "offline",
                ...(siteName != null ? { siteName } : {}),
                ...extra
            }
        });
    } catch (err) {
        logger.error(
            `fireSiteOfflineAlert: unexpected error for siteId ${siteId}`,
            err
        );
    }
}
