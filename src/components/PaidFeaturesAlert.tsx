"use client";
import { Card, CardContent } from "@app/components/ui/card";
import { build } from "@server/build";
import { usePaidStatus } from "@app/hooks/usePaidStatus";
import { ExternalLink, KeyRound, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

const bannerClassName =
    "mb-6 border-primary/30 bg-linear-to-br from-primary/10 via-background to-background overflow-hidden";
const bannerContentClassName = "py-3 px-4";
const bannerRowClassName =
    "flex items-center gap-2.5 text-sm text-muted-foreground";

export function PaidFeaturesAlert() {
    const t = useTranslations();
    const { hasSaasSubscription, hasEnterpriseLicense } = usePaidStatus();
    return (
        <>
            {build === "saas" && !hasSaasSubscription ? (
                <Card className={bannerClassName}>
                    <CardContent className={bannerContentClassName}>
                        <div className={bannerRowClassName}>
                            <KeyRound className="size-4 shrink-0 text-primary" />
                            <span>{t("subscriptionRequiredToUse")}</span>
                        </div>
                    </CardContent>
                </Card>
            ) : null}

            {build === "enterprise" && !hasEnterpriseLicense ? (
                <Card className={bannerClassName}>
                    <CardContent className={bannerContentClassName}>
                        <div className={bannerRowClassName}>
                            <KeyRound className="size-4 shrink-0 text-primary" />
                            <span>{t("licenseRequiredToUse")}</span>
                        </div>
                    </CardContent>
                </Card>
            ) : null}

            {build === "oss" && !hasEnterpriseLicense ? (
                <Card className={bannerClassName}>
                    <CardContent className={bannerContentClassName}>
                        <div className={bannerRowClassName}>
                            <KeyRound className="size-4 shrink-0 text-primary" />
                            <span>
                                {t.rich("ossEnterpriseEditionRequired", {
                                    enterpriseEditionLink: (chunks) => (
                                        <Link
                                            href="https://docs.pangolin.net/self-host/enterprise-edition"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 font-medium text-foreground underline"
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
