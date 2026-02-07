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

import {
    freeLimitSet,
    homeLabLimitSet,
    starterLimitSet,
    scaleLimitSet,
    limitsService,
    LimitSet
} from "@server/lib/billing";
import { usageService } from "@server/lib/billing/usageService";
import { SubscriptionType } from "./hooks/getSubType";

function getLimitSetForSubscriptionType(subType: SubscriptionType | null): LimitSet {
    switch (subType) {
        case "home_lab":
            return homeLabLimitSet;
        case "starter":
            return starterLimitSet;
        case "scale":
            return scaleLimitSet;
        case "license":
            // License subscriptions use starter limits by default
            // This can be adjusted based on your business logic
            return starterLimitSet;
        default:
            return freeLimitSet;
    }
}

export async function handleSubscriptionLifesycle(
    orgId: string,
    status: string,
    subType: SubscriptionType | null
) {
    switch (status) {
        case "active":
            const activeLimitSet = getLimitSetForSubscriptionType(subType);
            await limitsService.applyLimitSetToOrg(orgId, activeLimitSet);
            await usageService.checkLimitSet(orgId, true);
            break;
        case "canceled":
            // Subscription canceled - revert to free tier
            await limitsService.applyLimitSetToOrg(orgId, freeLimitSet);
            await usageService.checkLimitSet(orgId, true);
            break;
        case "past_due":
            // Payment past due - keep current limits but notify customer
            // Limits will revert to free tier if it becomes unpaid
            break;
        case "unpaid":
            // Subscription unpaid - revert to free tier
            await limitsService.applyLimitSetToOrg(orgId, freeLimitSet);
            await usageService.checkLimitSet(orgId, true);
            break;
        case "incomplete":
            // Payment incomplete - give them time to complete payment
            break;
        case "incomplete_expired":
            // Payment never completed - revert to free tier
            await limitsService.applyLimitSetToOrg(orgId, freeLimitSet);
            await usageService.checkLimitSet(orgId, true);
            break;
        default:
            break;
    }
}
