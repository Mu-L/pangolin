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

import { build } from "@server/build";
import { db, customers, subscriptions } from "@server/db";
import { Tier } from "@server/types/Tiers";
import { eq, and, ne } from "drizzle-orm";

export async function getOrgTierData(
    orgId: string
): Promise<{ tier: Tier | null; active: boolean }> {
    let tier: Tier | null = null;
    let active = false;

    if (build !== "saas") {
        return { tier, active };
    }

    try {
        // Get customer for org
        const [customer] = await db
            .select()
            .from(customers)
            .where(eq(customers.orgId, orgId))
            .limit(1);

        if (customer) {
            // Query for active subscriptions that are not license type
            const [subscription] = await db
                .select()
                .from(subscriptions)
                .where(
                    and(
                        eq(subscriptions.customerId, customer.customerId),
                        eq(subscriptions.status, "active"),
                        ne(subscriptions.type, "license")
                    )
                )
                .limit(1);

            if (subscription) {
                // Validate that subscription.type is one of the expected tier values
                if (
                    subscription.type === "tier1" ||
                    subscription.type === "tier2" ||
                    subscription.type === "tier3"
                ) {
                    tier = subscription.type;
                    active = true;
                }
            }
        }
    } catch (error) {
        // If org not found or error occurs, return null tier and inactive
        // This is acceptable behavior as per the function signature
    }

    return { tier, active };
}
