import { Limit, Subscription, SubscriptionItem, Usage } from "@server/db";

export type GetOrgSubscriptionResponse = {
    subscriptions: Array<{ subscription: Subscription; items: SubscriptionItem[] }>;
    /** When build === saas, true if org has exceeded plan limits (sites, users, etc.) */
    limitsExceeded?: boolean;
};

export type GetOrgUsageResponse = {
    usage: Usage[];
    limits: Limit[];
};

export type GetOrgTierResponse = {
    tier: string | null;
    active: boolean;
};
