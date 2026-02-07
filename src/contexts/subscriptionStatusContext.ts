import { GetOrgSubscriptionResponse } from "@server/routers/billing/types";
import { createContext } from "react";

type SubscriptionStatusContextType = {
    subscriptionStatus: GetOrgSubscriptionResponse | null;
    updateSubscriptionStatus: (updatedSite: GetOrgSubscriptionResponse) => void;
    isActive: () => boolean;
    getTier: () => { tier: string | null; active: boolean };
    isSubscribed: () => boolean;
    subscribed: boolean;
};

const SubscriptionStatusContext = createContext<
    SubscriptionStatusContextType | undefined
>(undefined);

export default SubscriptionStatusContext;
