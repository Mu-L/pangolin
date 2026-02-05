import { Limit, Subscription, SubscriptionItem, Usage } from "@server/db";

export type GetOrgSubscriptionResponse = {
    subscriptions: Array<{ subscription: Subscription; items: SubscriptionItem[] }>;
};

export type GetOrgUsageResponse = {
    usage: Usage[];
    limits: Limit[];
};

export type GetOrgTierResponse = {
    tier: string | null;
    active: boolean;
};
