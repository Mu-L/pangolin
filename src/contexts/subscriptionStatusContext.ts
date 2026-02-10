import { GetOrgSubscriptionResponse } from "@server/routers/billing/types";
import { Tier } from "@server/types/Tiers";
import { createContext } from "react";

type SubscriptionStatusContextType = {
    subscriptionStatus: GetOrgSubscriptionResponse | null;
    updateSubscriptionStatus: (updatedSite: GetOrgSubscriptionResponse) => void;
    getTier: () => { tier: Tier | null; active: boolean };
    isSubscribed: () => boolean;
    subscribed: boolean;
};

const SubscriptionStatusContext = createContext<
    SubscriptionStatusContextType | undefined
>(undefined);

export default SubscriptionStatusContext;
