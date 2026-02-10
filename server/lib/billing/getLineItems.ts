import Stripe from "stripe";
import { FeatureId, FeaturePriceSet } from "./features";
import { usageService } from "./usageService";

export async function getLineItems(
    featurePriceSet: FeaturePriceSet,
    orgId: string,
): Promise<Stripe.Checkout.SessionCreateParams.LineItem[]> {
    const users = await usageService.getUsage(orgId, FeatureId.USERS);

    return Object.entries(featurePriceSet).map(([featureId, priceId]) => {
        let quantity: number | undefined;

        if (featureId === FeatureId.USERS) {
            quantity = users?.instantaneousValue || 1;
        } else if (featureId === FeatureId.TIER1) {
            quantity = 1;
        }

        return {
            price: priceId,
            quantity: quantity
        };
    });
}
