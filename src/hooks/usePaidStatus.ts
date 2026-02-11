import { build } from "@server/build";
import { useLicenseStatusContext } from "./useLicenseStatusContext";
import { useSubscriptionStatusContext } from "./useSubscriptionStatusContext";
import { Tier } from "@server/types/Tiers";

export function usePaidStatus() {
    const { isUnlocked } = useLicenseStatusContext();
    const subscription = useSubscriptionStatusContext();

    // Check if features are disabled due to licensing/subscription
    const hasEnterpriseLicense = build === "enterprise" && isUnlocked();
    const tierData = subscription?.getTier();

    function hasSaasSubscription(tiers: Tier[]): boolean {
        return (
            (build === "saas" &&
                tierData?.active &&
                tierData?.tier &&
                tiers.includes(tierData.tier)) ||
            false
        );
    }

    function isPaidUser(tiers: Tier[]): boolean {
        if (hasEnterpriseLicense) {
            return true;
        }

        return hasSaasSubscription(tiers);
    }

    return {
        hasEnterpriseLicense,
        hasSaasSubscription,
        isPaidUser,
        isActive: tierData?.active,
        subscriptionTier: tierData?.tier
    };
}
