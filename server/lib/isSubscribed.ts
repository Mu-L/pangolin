import { Tier } from "@server/types/Tiers";

export async function isSubscribed(
    orgId: string,
    tiers: Tier[]
): Promise<boolean> {
    return false;
}
