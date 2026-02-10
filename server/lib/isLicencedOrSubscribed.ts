import { Tier } from "@server/types/Tiers";

export async function isLicensedOrSubscribed(
    orgId: string,
    tiers: Tier[]
): Promise<boolean> {
    return false;
}
