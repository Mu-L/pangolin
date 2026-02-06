import Stripe from "stripe";

export enum FeatureId {
    USERS = "users",
    SITES = "sites",
    EGRESS_DATA_MB = "egressDataMb",
    DOMAINS = "domains",
    REMOTE_EXIT_NODES = "remoteExitNodes",
    HOME_LAB = "home_lab"
}

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

export const homeLabFeaturePriceSet: FeaturePriceSet = {
    [FeatureId.HOME_LAB]: "price_1SxgpPDCpkOb237Bfo4rIsoT"
};

export const homeLabFeaturePriceSetSandbox: FeaturePriceSet = {
    [FeatureId.HOME_LAB]: "price_1SxgpPDCpkOb237Bfo4rIsoT"
};

export function getHomeLabFeaturePriceSet(): FeaturePriceSet {
    if (
        process.env.ENVIRONMENT == "prod" &&
        process.env.SANDBOX_MODE !== "true"
    ) {
        return homeLabFeaturePriceSet;
    } else {
        return homeLabFeaturePriceSetSandbox;
    }
}

export const starterFeaturePriceSet: FeaturePriceSet = {
    [FeatureId.USERS]: "price_1SxaEHDCpkOb237BD9lBkPiR"
};

export const starterFeaturePriceSetSandbox: FeaturePriceSet = {
    [FeatureId.USERS]: "price_1SxaEHDCpkOb237BD9lBkPiR"
};

export function getStarterFeaturePriceSet(): FeaturePriceSet {
    if (
        process.env.ENVIRONMENT == "prod" &&
        process.env.SANDBOX_MODE !== "true"
    ) {
        return starterFeaturePriceSet;
    } else {
        return starterFeaturePriceSetSandbox;
    }
}

export const scaleFeaturePriceSet: FeaturePriceSet = {
    [FeatureId.USERS]: "price_1SxaEODCpkOb237BiXdCBSfs"
};

export const scaleFeaturePriceSetSandbox: FeaturePriceSet = {
    [FeatureId.USERS]: "price_1SxaEODCpkOb237BiXdCBSfs"
};

export function getScaleFeaturePriceSet(): FeaturePriceSet {
    if (
        process.env.ENVIRONMENT == "prod" &&
        process.env.SANDBOX_MODE !== "true"
    ) {
        return scaleFeaturePriceSet;
    } else {
        return scaleFeaturePriceSetSandbox;
    }
}

export function getLineItems(
    featurePriceSet: FeaturePriceSet
): Stripe.Checkout.SessionCreateParams.LineItem[] {
    return Object.entries(featurePriceSet).map(([featureId, priceId]) => ({
        price: priceId
    }));
}
