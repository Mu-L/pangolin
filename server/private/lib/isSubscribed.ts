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
import { getOrgTierData } from "#private/lib/billing";

export async function isSubscribed(orgId: string): Promise<boolean> {
    if (build === "saas") {
        const { tier, active } = await getOrgTierData(orgId);
        return (tier == "home_lab" || tier == "starter" || tier == "scale") && active;
    }

    return false;
}
