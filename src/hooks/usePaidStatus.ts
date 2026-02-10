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
    const hasSaasSubscription = build === "saas" && tierData?.active;

    function isPaidUser(tiers: Tier[]): boolean {
        if (hasEnterpriseLicense) {
            return true;
        }

        if (
            hasSaasSubscription &&
            tierData?.tier &&
            tiers.includes(tierData.tier)
        ) {
            return true;
        }

        return false;
    }

    return {
        hasEnterpriseLicense,
        hasSaasSubscription,
        isPaidUser,
        subscriptionTier: tierData?.tier
    };
}
