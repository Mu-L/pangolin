import { FeatureId } from "./features";

export type LimitSet = Partial<{
    [key in FeatureId]: {
        value: number | null; // null indicates no limit
        description?: string;
    };
}>;

export const sandboxLimitSet: LimitSet = {
    [FeatureId.SITES]: { value: 1, description: "Sandbox limit" }, // 1 site up for 2 days
    [FeatureId.USERS]: { value: 1, description: "Sandbox limit" },
    [FeatureId.EGRESS_DATA_MB]: { value: 1000, description: "Sandbox limit" }, // 1 GB
    [FeatureId.DOMAINS]: { value: 0, description: "Sandbox limit" },
    [FeatureId.REMOTE_EXIT_NODES]: { value: 0, description: "Sandbox limit" }
};

export const freeLimitSet: LimitSet = {
    [FeatureId.SITES]: { value: 3, description: "Free tier limit" }, // 1 site up for 32 days
    [FeatureId.USERS]: { value: 3, description: "Free tier limit" },
    [FeatureId.EGRESS_DATA_MB]: {
        value: 25000,
        description: "Free tier limit"
    }, // 25 GB
    [FeatureId.DOMAINS]: { value: 3, description: "Free tier limit" },
    [FeatureId.REMOTE_EXIT_NODES]: { value: 0, description: "Free tier limit" }
};

export const homeLabLimitSet: LimitSet = {
    [FeatureId.SITES]: { value: 3, description: "Home lab limit" }, // 1 site up for 32 days
    [FeatureId.USERS]: { value: 3, description: "Home lab limit" },
    [FeatureId.EGRESS_DATA_MB]: {
        value: 25000,
        description: "Home lab limit"
    }, // 25 GB
    [FeatureId.DOMAINS]: { value: 3, description: "Home lab limit" },
    [FeatureId.REMOTE_EXIT_NODES]: { value: 1, description: "Home lab limit" }
};

export const starterLimitSet: LimitSet = {
    [FeatureId.SITES]: {
        value: 10,
        description: "Starter limit"
    }, // 50 sites up for 31 days
    [FeatureId.USERS]: {
        value: 150,
        description: "Starter limit"
    },
    [FeatureId.EGRESS_DATA_MB]: {
        value: 12000000,
        description: "Starter limit"
    }, // 12000 GB
    [FeatureId.DOMAINS]: {
        value: 250,
        description: "Starter limit"
    },
    [FeatureId.REMOTE_EXIT_NODES]: {
        value: 5,
        description: "Starter limit"
    }
};

export const scaleLimitSet: LimitSet = {
    [FeatureId.SITES]: {
        value: 10,
        description: "Scale limit"
    }, // 50 sites up for 31 days
    [FeatureId.USERS]: {
        value: 150,
        description: "Scale limit"
    },
    [FeatureId.EGRESS_DATA_MB]: {
        value: 12000000,
        description: "Scale limit"
    }, // 12000 GB
    [FeatureId.DOMAINS]: {
        value: 250,
        description: "Scale limit"
    },
    [FeatureId.REMOTE_EXIT_NODES]: {
        value: 5,
        description: "Scale limit"
    }
};
