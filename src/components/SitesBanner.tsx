"use client";

import React from "react";
import { Button } from "@app/components/ui/button";
import { Plug, ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import DismissableBanner from "./DismissableBanner";

export const SitesBanner = () => {
    const t = useTranslations();

    return (
        <DismissableBanner
            storageKey="sites-banner-dismissed"
            version={1}
            title={t("sitesBannerTitle")}
            titleIcon={<Plug className="w-5 h-5 text-primary" />}
            description={t("sitesBannerDescription")}
        >
            <Link
                href="https://docs.pangolin.net/manage/sites/install-site"
                target="_blank"
                rel="noopener noreferrer"
            >
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 hover:bg-primary/10 hover:border-primary/50 transition-colors"
                >
                    {t("sitesBannerButtonText")}
                    <ArrowRight className="w-4 h-4" />
                </Button>
            </Link>
        </DismissableBanner>
    );
};

export default SitesBanner;
