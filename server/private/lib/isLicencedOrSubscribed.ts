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
import license from "#private/license/license";
import { getOrgTierData } from "#private/lib/billing";

export async function isLicensedOrSubscribed(orgId: string): Promise<boolean> {
    if (build === "enterprise") {
        return await license.isUnlocked();
    }

    if (build === "saas") {
        const { tier, active } = await getOrgTierData(orgId);
        return (tier == "tier1" || tier == "tier2" || tier == "tier3") && active;
    }

    return false;
}
