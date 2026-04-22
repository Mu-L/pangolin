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
    extra?: Record<string, unknown>
): Promise<void> {
    try {
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
    extra?: Record<string, unknown>
): Promise<void> {
    try {
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
