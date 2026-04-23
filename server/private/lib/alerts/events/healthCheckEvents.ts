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
import {
    db,
    statusHistory,
    targetHealthCheck,
    targets,
    resources
} from "@server/db";
import { eq } from "drizzle-orm";
import {
    fireResourceHealthyAlert,
    fireResourceUnhealthyAlert
} from "./resourceEvents";

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
    healthCheckName?: string | null,
    healthCheckTargetId?: number | null,
    extra?: Record<string, unknown>
): Promise<void> {
    try {
        await db.insert(statusHistory).values({
            entityType: "health_check",
            entityId: healthCheckId,
            orgId: orgId,
            status: "healthy",
            timestamp: Math.floor(Date.now() / 1000)
        });

        await handleResource(orgId, healthCheckTargetId);

        await processAlerts({
            eventType: "health_check_healthy",
            orgId,
            healthCheckId,
            data: {
                ...(healthCheckName != null ? { healthCheckName } : {}),
                ...extra
            }
        });
        await processAlerts({
            eventType: "health_check_toggle",
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
 * Fire a `health_check_unhealthy` alert for the given health check.
 *
 * Call this after a health check has been detected as failing so that any
 * matching `alertRules` can dispatch their email and webhook actions.
 *
 * @param orgId         - Organisation that owns the health check.
 * @param healthCheckId - Numeric primary key of the health check.
 * @param healthCheckName - Human-readable name shown in notifications (optional).
 * @param extra         - Any additional key/value pairs to include in the payload.
 */
export async function fireHealthCheckUnhealthyAlert(
    orgId: string,
    healthCheckId: number,
    healthCheckName?: string | null,
    healthCheckTargetId?: number | null,
    extra?: Record<string, unknown>
): Promise<void> {
    try {
        await db.insert(statusHistory).values({
            entityType: "health_check",
            entityId: healthCheckId,
            orgId: orgId,
            status: "unhealthy",
            timestamp: Math.floor(Date.now() / 1000)
        });

        await handleResource(orgId, healthCheckTargetId);

        await processAlerts({
            eventType: "health_check_unhealthy",
            orgId,
            healthCheckId,
            data: {
                ...(healthCheckName != null ? { healthCheckName } : {}),
                ...extra
            }
        });
        await processAlerts({
            eventType: "health_check_toggle",
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
            `fireHealthCheckUnhealthyAlert: unexpected error for healthCheckId ${healthCheckId}`,
            err
        );
    }
}

async function handleResource(orgId: string, healthCheckTargetId?: number | null) {
    if (!healthCheckTargetId) {
        return;
    }
    // we have resources lets get them
    const [target] = await db
        .select()
        .from(targets)
        .where(eq(targets.targetId, healthCheckTargetId))
        .limit(1);

    if (!target) {
        return;
    }
    const [resource] = await db
        .select()
        .from(resources)
        .where(eq(resources.resourceId, target.resourceId))
        .limit(1);

    if (!resource) {
        return;
    }
    const otherTargets = await db
        .select({ hcHealth: targetHealthCheck.hcHealth })
        .from(targets)
        .where(eq(targets.resourceId, resource.resourceId));

    let health = "healthy";
    const allHealthy = otherTargets.every((t) => t.hcHealth === "healthy");
    if (!allHealthy) {
        logger.debug(
            `Not marking resource ${resource.resourceId} as healthy because not all targets are healthy`
        );
        health = "unhealthy";
    }

    if (health != resource.health) {
        // it changed
        await db
            .update(resources)
            .set({ health })
            .where(eq(resources.resourceId, resource.resourceId));

        if (health === "unhealthy") {
            await fireResourceUnhealthyAlert(
                orgId,
                resource.resourceId,
                resource.name
            );
        } else if (health === "healthy") {
            await fireResourceHealthyAlert(
                orgId,
                resource.resourceId,
                resource.name
            );
        }
    }
}
