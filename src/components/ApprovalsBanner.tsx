"use client";

import React from "react";
import { Button } from "@app/components/ui/button";
import { ShieldCheck, ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import DismissableBanner from "./DismissableBanner";

export const ApprovalsBanner = () => {
    const t = useTranslations();

    return (
        <DismissableBanner
            storageKey="approvals-banner-dismissed"
            version={1}
            title={t("approvalsBannerTitle")}
            titleIcon={<ShieldCheck className="w-5 h-5 text-primary" />}
            description={t("approvalsBannerDescription")}
        >
            <Link
                href="https://docs.pangolin.net/manage/access-control/approvals"
                target="_blank"
                rel="noopener noreferrer"
            >
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 hover:bg-primary/10 hover:border-primary/50 transition-colors"
                >
                    {t("approvalsBannerButtonText")}
                    <ArrowRight className="w-4 h-4" />
                </Button>
            </Link>
        </DismissableBanner>
    );
};

export default ApprovalsBanner;
