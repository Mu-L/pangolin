"use client";

import { Card, CardContent } from "@app/components/ui/card";
import { build } from "@server/build";
import { usePaidStatus } from "@app/hooks/usePaidStatus";
import { ExternalLink, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { Tier } from "@server/types/Tiers";
import { useParams } from "next/navigation";

const TIER_ORDER: Tier[] = ["tier1", "tier2", "tier3", "enterprise"];

const TIER_TRANSLATION_KEYS: Record<Tier, "subscriptionTierTier1" | "subscriptionTierTier2" | "subscriptionTierTier3" | "subscriptionTierEnterprise"> = {
    tier1: "subscriptionTierTier1",
    tier2: "subscriptionTierTier2",
    tier3: "subscriptionTierTier3",
    enterprise: "subscriptionTierEnterprise"
};

function getRequiredTier(tiers: Tier[]): Tier | null {
    if (tiers.length === 0) return null;
    let min: Tier | null = null;
    for (const tier of tiers) {
        const idx = TIER_ORDER.indexOf(tier);
        if (idx === -1) continue;
        if (min === null || TIER_ORDER.indexOf(min) > idx) {
            min = tier;
        }
    }
    return min;
}

const bannerClassName =
    "mb-6 border-purple-500/30 bg-linear-to-br from-purple-500/10 via-background to-background overflow-hidden";
const bannerContentClassName = "py-3 px-4";
const bannerRowClassName =
    "flex items-center gap-2.5 text-sm text-muted-foreground";
const bannerIconClassName = "size-4 shrink-0 text-purple-500";
const docsLinkClassName =
    "inline-flex items-center gap-1 font-medium text-purple-600 underline";
const PANGOLIN_CLOUD_SIGNUP_URL = "https://app.pangolin.net/auth/signup/";
const ENTERPRISE_DOCS_URL =
    "https://docs.pangolin.net/self-host/enterprise-edition";

function getTierLinkRenderer(billingHref: string) {
    return function tierLinkRenderer(chunks: React.ReactNode) {
        return (
            <Link href={billingHref} className={docsLinkClassName}>
                {chunks}
            </Link>
        );
    };
}

function getPangolinCloudLinkRenderer() {
    return function pangolinCloudLinkRenderer(chunks: React.ReactNode) {
        return (
            <Link
                href={PANGOLIN_CLOUD_SIGNUP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={docsLinkClassName}
            >
                {chunks}
                <ExternalLink className="size-3.5 shrink-0" />
            </Link>
        );
    };
}

function getDocsLinkRenderer(href: string) {
    return function docsLinkRenderer(chunks: React.ReactNode) {
        return (
            <Link
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={docsLinkClassName}
            >
                {chunks}
                <ExternalLink className="size-3.5 shrink-0" />
            </Link>
        );
    };
}

type Props = {
    tiers: Tier[];
};

export function PaidFeaturesAlert({ tiers }: Props) {
    const t = useTranslations();
    const params = useParams();
    const orgId = params?.orgId as string | undefined;
    const { hasSaasSubscription, hasEnterpriseLicense, isActive, subscriptionTier } = usePaidStatus();
    const { env } = useEnvContext();
    const requiredTier = getRequiredTier(tiers);
    const requiredTierName = requiredTier ? t(TIER_TRANSLATION_KEYS[requiredTier]) : null;
    const billingHref = orgId ? `/${orgId}/settings/billing` : "https://pangolin.net/pricing";
    const tierLinkRenderer = getTierLinkRenderer(billingHref);
    const pangolinCloudLinkRenderer = getPangolinCloudLinkRenderer();
    const enterpriseDocsLinkRenderer = getDocsLinkRenderer(ENTERPRISE_DOCS_URL);

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
                            <span>
                                {requiredTierName
                                    ? isActive
                                        ? t.rich("upgradeToTierToUse", {
                                            tier: requiredTierName,
                                            tierLink: tierLinkRenderer
                                        })
                                        : t.rich("subscriptionRequiredTierToUse", {
                                            tier: requiredTierName,
                                            tierLink: tierLinkRenderer
                                        })
                                    : isActive
                                      ? t("mustUpgradeToUse")
                                      : t("subscriptionRequiredToUse")}
                            </span>
                        </div>
                    </CardContent>
                </Card>
            ) : null}

            {build === "enterprise" && !hasEnterpriseLicense ? (
                <Card className={bannerClassName}>
                    <CardContent className={bannerContentClassName}>
                        <div className={bannerRowClassName}>
                            <KeyRound className={bannerIconClassName} />
                            <span>
                                {t.rich("licenseRequiredToUse", {
                                    enterpriseLicenseLink: enterpriseDocsLinkRenderer,
                                    pangolinCloudLink: pangolinCloudLinkRenderer
                                })}
                            </span>
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
                                    enterpriseEditionLink: enterpriseDocsLinkRenderer,
                                    pangolinCloudLink: pangolinCloudLinkRenderer
                                })}
                            </span>
                        </div>
                    </CardContent>
                </Card>
            ) : null}
        </>
    );
}
