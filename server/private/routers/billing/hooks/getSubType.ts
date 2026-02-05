import {
    getLicensePriceSet,
} from "@server/lib/billing/licenses";
import {
    getTierPriceSet,
} from "@server/lib/billing/tiers";
import Stripe from "stripe";

export function getSubType(fullSubscription: Stripe.Response<Stripe.Subscription>): "saas" | "license" {
    // Determine subscription type by checking subscription items
    let type: "saas" | "license" = "saas";
    if (Array.isArray(fullSubscription.items?.data)) {
        for (const item of fullSubscription.items.data) {
            const priceId = item.price.id;

            // Check if price ID matches any license price
            const licensePrices = Object.values(getLicensePriceSet());

            if (licensePrices.includes(priceId)) {
                type = "license";
                break;
            }

            // Check if price ID matches any tier price (saas)
            const tierPrices = Object.values(getTierPriceSet());

            if (tierPrices.includes(priceId)) {
                type = "saas";
                break;
            }
        }
    }

    return type;
}
