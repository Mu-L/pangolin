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

import { getTierPriceSet } from "@server/lib/billing/tiers";
import { getOrgSubscriptionsData } from "@server/private/routers/billing/getOrgSubscriptions";
import { build } from "@server/build";

export async function getOrgTierData(
    orgId: string
): Promise<{ tier: string | null; active: boolean }> {
    let tier = null;
    let active = false;

    if (build !== "saas") {
        return { tier, active };
    }

    // TODO: THIS IS INEFFICIENT!!! WE SHOULD IMPROVE HOW WE STORE TIERS WITH SUBSCRIPTIONS AND RETRIEVE THEM

    const subscriptionsWithItems = await getOrgSubscriptionsData(orgId);

    return { tier, active };
}
