"use client";

import SubscriptionStatusContext from "@app/contexts/subscriptionStatusContext";
import { getTierPriceSet, TierId } from "@server/lib/billing/tiers";
import { GetOrgSubscriptionResponse } from "@server/routers/billing/types";
import { useState } from "react";
import { build } from "@server/build";

interface ProviderProps {
    children: React.ReactNode;
    subscriptionStatus: GetOrgSubscriptionResponse | null;
    env: string;
    sandbox_mode: boolean;
}

export function SubscriptionStatusProvider({
    children,
    subscriptionStatus,
    env,
    sandbox_mode
}: ProviderProps) {
    const [subscriptionStatusState, setSubscriptionStatusState] =
        useState<GetOrgSubscriptionResponse | null>(subscriptionStatus);

    const updateSubscriptionStatus = (
        updatedSubscriptionStatus: GetOrgSubscriptionResponse
    ) => {
        setSubscriptionStatusState((prev) => {
            return {
                ...updatedSubscriptionStatus
            };
        });
    };

    const isActive = () => {
        if (subscriptionStatus?.subscriptions) {
            // Check if any subscription is active
            return subscriptionStatus.subscriptions.some(
                (sub) => sub.subscription?.status === "active"
            );
        }
        return false;
    };

    const getTier = () => {
        const tierPriceSet = getTierPriceSet(env, sandbox_mode);

        if (subscriptionStatus?.subscriptions) {
            // Iterate through all subscriptions
            for (const { subscription, items } of subscriptionStatus.subscriptions) {
                if (items && items.length > 0) {
                    // Iterate through tiers in order (earlier keys are higher tiers)
                    for (const [tierId, priceId] of Object.entries(tierPriceSet)) {
                        // Check if any subscription item matches this tier's price ID
                        const matchingItem = items.find(
                            (item) => item.priceId === priceId
                        );
                        if (matchingItem) {
                            return tierId;
                        }
                    }
                }
            }
        }

        return null;
    };

    const isSubscribed = () => {
        if (build === "enterprise") {
            return true;
        }
        return getTier() === TierId.STANDARD;
    };

    const [subscribed, setSubscribed] = useState<boolean>(isSubscribed());

    return (
        <SubscriptionStatusContext.Provider
            value={{
                subscriptionStatus: subscriptionStatusState,
                updateSubscriptionStatus,
                isActive,
                getTier,
                isSubscribed,
                subscribed
            }}
        >
            {children}
        </SubscriptionStatusContext.Provider>
    );
}

export default SubscriptionStatusProvider;