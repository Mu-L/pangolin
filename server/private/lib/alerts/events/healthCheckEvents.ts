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
 * Fire a `health_check_healthy` alert for the given health check.
 *
 * Call this after a previously-failing health check has recovered so that any
 * matching `alertRules` can dispatch their email and webhook actions.
 *
 * @param orgId         - Organisation that owns the health check.
 * @param healthCheckId - Numeric primary key of the health check.
 * @param healthCheckName - Human-readable name shown in notifications (optional).
 * @param extra         - Any additional key/value pairs to include in the payload.
 */
export async function fireHealthCheckHealthyAlert(
    orgId: string,
    healthCheckId: number,
    healthCheckName?: string,
    extra?: Record<string, unknown>
): Promise<void> {
    try {
        await processAlerts({
            eventType: "health_check_healthy",
            orgId,
            healthCheckId,
            data: {
                healthCheckId,
                ...(healthCheckName != null ? { healthCheckName } : {}),
                ...extra
            }
        });
    } catch (err) {
        logger.error(
            `fireHealthCheckHealthyAlert: unexpected error for healthCheckId ${healthCheckId}`,
            err
        );
    }
}

/**
 * Fire a `health_check_not_healthy` alert for the given health check.
 *
 * Call this after a health check has been detected as failing so that any
 * matching `alertRules` can dispatch their email and webhook actions.
 *
 * @param orgId         - Organisation that owns the health check.
 * @param healthCheckId - Numeric primary key of the health check.
 * @param healthCheckName - Human-readable name shown in notifications (optional).
 * @param extra         - Any additional key/value pairs to include in the payload.
 */
export async function fireHealthCheckNotHealthyAlert(
    orgId: string,
    healthCheckId: number,
    healthCheckName?: string,
    extra?: Record<string, unknown>
): Promise<void> {
    try {
        await processAlerts({
            eventType: "health_check_not_healthy",
            orgId,
            healthCheckId,
            data: {
                healthCheckId,
                ...(healthCheckName != null ? { healthCheckName } : {}),
                ...extra
            }
        });
    } catch (err) {
        logger.error(
            `fireHealthCheckNotHealthyAlert: unexpected error for healthCheckId ${healthCheckId}`,
            err
        );
    }
}