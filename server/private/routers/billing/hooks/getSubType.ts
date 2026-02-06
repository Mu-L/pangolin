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
    getLicensePriceSet,
} from "@server/lib/billing/licenses";
import {
    getHomeLabFeaturePriceSet,
    getStarterFeaturePriceSet,
    getScaleFeaturePriceSet,
} from "@server/lib/billing/features";
import Stripe from "stripe";

export type SubscriptionType = "home_lab" | "starter" | "scale" | "license";

export function getSubType(fullSubscription: Stripe.Response<Stripe.Subscription>): SubscriptionType | null {
    // Determine subscription type by checking subscription items
    if (!Array.isArray(fullSubscription.items?.data) || fullSubscription.items.data.length === 0) {
        return null;
    }

    for (const item of fullSubscription.items.data) {
        const priceId = item.price.id;

        // Check if price ID matches any license price
        const licensePrices = Object.values(getLicensePriceSet());
        if (licensePrices.includes(priceId)) {
            return "license";
        }

        // Check if price ID matches home lab tier
        const homeLabPrices = Object.values(getHomeLabFeaturePriceSet());
        if (homeLabPrices.includes(priceId)) {
            return "home_lab";
        }

        // Check if price ID matches starter tier
        const starterPrices = Object.values(getStarterFeaturePriceSet());
        if (starterPrices.includes(priceId)) {
            return "starter";
        }

        // Check if price ID matches scale tier
        const scalePrices = Object.values(getScaleFeaturePriceSet());
        if (scalePrices.includes(priceId)) {
            return "scale";
        }
    }

    return null;
}