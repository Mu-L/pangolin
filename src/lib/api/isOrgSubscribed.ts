import { build } from "@server/build";
import { cache } from "react";
import { getCachedSubscription } from "./getCachedSubscription";
import { priv } from ".";
import { AxiosResponse } from "axios";
import { GetLicenseStatusResponse } from "@server/routers/license/types";

export const isOrgSubscribed = cache(async (orgId: string) => {
    let subscribed = false;

    if (build === "enterprise") {
        try {
            const licenseStatusRes =
                await priv.get<AxiosResponse<GetLicenseStatusResponse>>(
                    "/license/status"
                );
            subscribed = licenseStatusRes.data.data.isLicenseValid;
        } catch (error) {}
    } else if (build === "saas") {
        try {
            const subRes = await getCachedSubscription(orgId);
            subscribed =
                (subRes.data.data.tier == "home_lab" || subRes.data.data.tier == "starter" || subRes.data.data.tier == "scale") &&
                subRes.data.data.active;
        } catch {}
    }

    return subscribed;
});
