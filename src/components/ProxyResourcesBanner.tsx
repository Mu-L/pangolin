"use client";

import React from "react";
import { Globe } from "lucide-react";
import { useTranslations } from "next-intl";
import DismissableBanner from "./DismissableBanner";

export const ProxyResourcesBanner = () => {
    const t = useTranslations();

    return (
        <DismissableBanner
            storageKey="proxy-resources-banner-dismissed"
            version={1}
            title={t("proxyResourcesBannerTitle")}
            titleIcon={<Globe className="w-5 h-5 text-primary" />}
            description={t("proxyResourcesBannerDescription")}
        />
    );
};

export default ProxyResourcesBanner;

