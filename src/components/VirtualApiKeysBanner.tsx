"use client";

import { Button } from "@app/components/ui/button";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { ArrowRight, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import DismissableBanner from "./DismissableBanner";

type VirtualApiKeysBannerProps = {
    orgId: string;
};

export const VirtualApiKeysBanner = ({ orgId }: VirtualApiKeysBannerProps) => {
    const t = useTranslations();
    const { env } = useEnvContext();

    const dashboardUrl = env.app.dashboardUrl?.replace(/\/$/, "") ?? "";
    const keysUrl = dashboardUrl
        ? `${dashboardUrl}/${orgId}/keys`
        : `/${orgId}/keys`;

    return (
        <DismissableBanner
            storageKey="virtual-api-keys-banner-dismissed"
            version={1}
            title={t("virtualApiKeysBannerTitle")}
            titleIcon={<KeyRound className="w-5 h-5 text-primary" />}
            description={t("virtualApiKeysBannerDescription", { keysUrl })}
        >
            <Link href={`/${orgId}/keys`}>
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 hover:bg-primary/10 hover:border-primary/50 transition-colors"
                >
                    {t("virtualApiKeysBannerButtonText")}
                    <ArrowRight className="w-4 h-4" />
                </Button>
            </Link>
        </DismissableBanner>
    );
};

export default VirtualApiKeysBanner;
