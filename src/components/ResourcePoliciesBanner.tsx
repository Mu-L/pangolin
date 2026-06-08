"use client";

import { Shield } from "lucide-react";
import { useTranslations } from "next-intl";
import DismissableBanner from "./DismissableBanner";

export const ResourcePoliciesBanner = () => {
    const t = useTranslations();

    return (
        <DismissableBanner
            storageKey="resource-policies-banner-dismissed"
            version={1}
            title={t("resourcePoliciesBannerTitle")}
            titleIcon={<Shield className="w-5 h-5 text-primary" />}
            description={t("resourcePoliciesBannerDescription")}
        />
    );
};

export default ResourcePoliciesBanner;
