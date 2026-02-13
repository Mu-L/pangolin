export enum FeatureId {
    USERS = "users",
    SITES = "sites",
    EGRESS_DATA_MB = "egressDataMb",
    DOMAINS = "domains",
    REMOTE_EXIT_NODES = "remoteExitNodes",
    TIER1 = "tier1"
}

export async function getFeatureDisplayName(featureId: FeatureId): Promise<string> {
    switch (featureId) {
        case FeatureId.USERS:
            return "Users";
        case FeatureId.SITES:
            return "Sites";
        case FeatureId.EGRESS_DATA_MB:
            return "Egress Data (MB)";
        case FeatureId.DOMAINS:
            return "Domains";
        case FeatureId.REMOTE_EXIT_NODES:
            return "Remote Exit Nodes";
        case FeatureId.TIER1:
            return "Home Lab";
        default:
            return featureId;
    }
}

// this is from the old system
export const FeatureMeterIds: Partial<Record<FeatureId, string>> = { // right now we are not charging for any data
    // [FeatureId.EGRESS_DATA_MB]: "mtr_61Srreh9eWrExDSCe41D3Ee2Ir7Wm5YW"
};

export const FeatureMeterIdsSandbox: Partial<Record<FeatureId, string>> = {
    // [FeatureId.EGRESS_DATA_MB]: "mtr_test_61Snh2a2m6qome5Kv41DCpkOb237B3dQ"
};

export function getFeatureMeterId(featureId: FeatureId): string | undefined {
    if (
        process.env.ENVIRONMENT == "prod" &&
        process.env.SANDBOX_MODE !== "true"
    ) {
        return FeatureMeterIds[featureId];
    } else {
        return FeatureMeterIdsSandbox[featureId];
    }
}

export function getFeatureIdByMetricId(
    metricId: string
): FeatureId | undefined {
    return (Object.entries(FeatureMeterIds) as [FeatureId, string][]).find(
        ([_, v]) => v === metricId
    )?.[0];
}

export type FeaturePriceSet = Partial<Record<FeatureId, string>>;

export const tier1FeaturePriceSet: FeaturePriceSet = {
    [FeatureId.TIER1]: "price_1SzVE3D3Ee2Ir7Wm6wT5Dl3G"
};

export const tier1FeaturePriceSetSandbox: FeaturePriceSet = {
    [FeatureId.TIER1]: "price_1SxgpPDCpkOb237Bfo4rIsoT"
};

export function getTier1FeaturePriceSet(): FeaturePriceSet {
    if (
        process.env.ENVIRONMENT == "prod" &&
        process.env.SANDBOX_MODE !== "true"
    ) {
        return tier1FeaturePriceSet;
    } else {
        return tier1FeaturePriceSetSandbox;
    }
}

export const tier2FeaturePriceSet: FeaturePriceSet = {
    [FeatureId.USERS]: "price_1SzVCcD3Ee2Ir7Wmn6U3KvPN"
};

export const tier2FeaturePriceSetSandbox: FeaturePriceSet = {
    [FeatureId.USERS]: "price_1SxaEHDCpkOb237BD9lBkPiR"
};

export function getTier2FeaturePriceSet(): FeaturePriceSet {
    if (
        process.env.ENVIRONMENT == "prod" &&
        process.env.SANDBOX_MODE !== "true"
    ) {
        return tier2FeaturePriceSet;
    } else {
        return tier2FeaturePriceSetSandbox;
    }
}

export const tier3FeaturePriceSet: FeaturePriceSet = {
    [FeatureId.USERS]: "price_1SzVDKD3Ee2Ir7WmPtOKNusv"
};

export const tier3FeaturePriceSetSandbox: FeaturePriceSet = {
    [FeatureId.USERS]: "price_1SxaEODCpkOb237BiXdCBSfs"
};

export function getTier3FeaturePriceSet(): FeaturePriceSet {
    if (
        process.env.ENVIRONMENT == "prod" &&
        process.env.SANDBOX_MODE !== "true"
    ) {
        return tier3FeaturePriceSet;
    } else {
        return tier3FeaturePriceSetSandbox;
    }
}

export function getFeatureIdByPriceId(priceId: string): FeatureId | undefined {
    // Check all feature price sets
    const allPriceSets = [
        getTier1FeaturePriceSet(),
        getTier2FeaturePriceSet(),
        getTier3FeaturePriceSet()
    ];

    for (const priceSet of allPriceSets) {
        const entry = (Object.entries(priceSet) as [FeatureId, string][]).find(
            ([_, price]) => price === priceId
        );
        if (entry) {
            return entry[0];
        }
    }

    return undefined;
}
