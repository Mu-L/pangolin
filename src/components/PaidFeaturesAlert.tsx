"use client";

import { Card, CardContent } from "@app/components/ui/card";
import { build } from "@server/build";
import { usePaidStatus } from "@app/hooks/usePaidStatus";
import { ExternalLink, KeyRound, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { Tier } from "@server/types/Tiers";

const bannerClassName =
    "mb-6 border-purple-500/30 bg-linear-to-br from-purple-500/10 via-background to-background overflow-hidden";
const bannerContentClassName = "py-3 px-4";
const bannerRowClassName =
    "flex items-center gap-2.5 text-sm text-muted-foreground";
const bannerIconClassName = "size-4 shrink-0 text-purple-500";

type Props = {
    tiers: Tier[];
};

export function PaidFeaturesAlert({ tiers }: Props) {
    const t = useTranslations();
    const { hasSaasSubscription, hasEnterpriseLicense, isActive } = usePaidStatus();
    const { env } = useEnvContext();

    if (env.flags.disableEnterpriseFeatures) {
        return null;
    }

    return (
        <>
            {build === "saas" && !hasSaasSubscription(tiers) ? (
                <Card className={bannerClassName}>
                    <CardContent className={bannerContentClassName}>
                        <div className={bannerRowClassName}>
                            <KeyRound className={bannerIconClassName} />
                            <span>{isActive ? t("mustUpgradeToUse") : t("subscriptionRequiredToUse")}</span>
                        </div>
                    </CardContent>
                </Card>
            ) : null}

            {build === "enterprise" && !hasEnterpriseLicense ? (
                <Card className={bannerClassName}>
                    <CardContent className={bannerContentClassName}>
                        <div className={bannerRowClassName}>
                            <KeyRound className={bannerIconClassName} />
                            <span>{t("licenseRequiredToUse")}</span>
                        </div>
                    </CardContent>
                </Card>
            ) : null}

            {build === "oss" && !hasEnterpriseLicense ? (
                <Card className={bannerClassName}>
                    <CardContent className={bannerContentClassName}>
                        <div className={bannerRowClassName}>
                            <KeyRound className={bannerIconClassName} />
                            <span>
                                {t.rich("ossEnterpriseEditionRequired", {
                                    enterpriseEditionLink: (chunks) => (
                                        <Link
                                            href="https://docs.pangolin.net/self-host/enterprise-edition"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 font-medium text-purple-600 underline"
                                        >
                                            {chunks}
                                            <ExternalLink className="size-3.5 shrink-0" />
                                        </Link>
                                    )
                                })}
                            </span>
                        </div>
                    </CardContent>
                </Card>
            ) : null}
        </>
    );
}
