"use client";

import SubscriptionStatusContext from "@app/contexts/subscriptionStatusContext";
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
        if (subscriptionStatus?.subscriptions) {
            // Iterate through all subscriptions
            for (const { subscription } of subscriptionStatus.subscriptions) {
                if (
                    subscription.type == "tier1" ||
                    subscription.type == "tier2" ||
                    subscription.type == "tier3"
                ) {
                    return {
                        tier: subscription.type,
                        active: subscription.status === "active"
                    };
                }
            }
        }

        return {
            tier: null,
            active: false
        };
    };

    const isSubscribed = () => {
        if (build === "enterprise") {
            return true;
        }
        const { tier, active } = getTier();
        return (
            (tier == "tier1" || tier == "tier2" || tier == "tier3") &&
            active
        );
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
