"use client";

import { Button } from "@app/components/ui/button";
import { useOrgContext } from "@app/hooks/useOrgContext";
import { toast } from "@app/hooks/useToast";
import { useState, useEffect } from "react";
import { createApiClient } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { formatAxiosError } from "@app/lib/api";
import { AxiosResponse } from "axios";
import {
    SettingsContainer,
    SettingsSection,
    SettingsSectionHeader,
    SettingsSectionTitle,
    SettingsSectionDescription,
    SettingsSectionBody,
    SettingsSectionFooter
} from "@app/components/Settings";
import {
    InfoSection,
    InfoSectionContent,
    InfoSections,
    InfoSectionTitle
} from "@app/components/InfoSection";
import {
    Credenza,
    CredenzaBody,
    CredenzaClose,
    CredenzaContent,
    CredenzaDescription,
    CredenzaFooter,
    CredenzaHeader,
    CredenzaTitle
} from "@app/components/Credenza";
import { cn } from "@app/lib/cn";
import {
    CreditCard,
    ExternalLink,
    Check
} from "lucide-react";
import {
    GetOrgSubscriptionResponse,
    GetOrgUsageResponse
} from "@server/routers/billing/types";
import { useTranslations } from "use-intl";
import Link from "next/link";
import { Tier } from "@server/types/Tiers";

// Plan tier definitions matching the mockup
type PlanId = "free" | "homelab" | "team" | "business" | "enterprise";

interface PlanOption {
    id: PlanId;
    name: string;
    price: string;
    priceDetail?: string;
    tierType: Tier | null;
}

const planOptions: PlanOption[] = [
    {
        id: "free",
        name: "Free",
        price: "Free",
        tierType: null
    },
    {
        id: "homelab",
        name: "Homelab",
        price: "$15",
        priceDetail: "/ month",
        tierType: "tier1"
    },
    {
        id: "team",
        name: "Team",
        price: "$5",
        priceDetail: "per user / month",
        tierType: "tier2"
    },
    {
        id: "business",
        name: "Business",
        price: "$10",
        priceDetail: "per user / month",
        tierType: "tier3"
    },
    {
        id: "enterprise",
        name: "Enterprise",
        price: "Custom",
        tierType: null
    }
];

export default function BillingPage() {
    const { org } = useOrgContext();
    const envContext = useEnvContext();
    const api = createApiClient(envContext);
    const t = useTranslations();

    // Subscription state
    const [allSubscriptions, setAllSubscriptions] = useState<
        GetOrgSubscriptionResponse["subscriptions"]
    >([]);
    const [tierSubscription, setTierSubscription] = useState<
        GetOrgSubscriptionResponse["subscriptions"][0] | null
    >(null);
    const [licenseSubscription, setLicenseSubscription] = useState<
        GetOrgSubscriptionResponse["subscriptions"][0] | null
    >(null);
    const [subscriptionLoading, setSubscriptionLoading] = useState(true);

    // Usage and limits data
    const [usageData, setUsageData] = useState<GetOrgUsageResponse["usage"]>(
        []
    );
    const [limitsData, setLimitsData] = useState<GetOrgUsageResponse["limits"]>(
        []
    );

    const [hasSubscription, setHasSubscription] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [currentTier, setCurrentTier] = useState<
        Tier | null
    >(null);

    // Usage IDs
    const SITES = "sites";
    const USERS = "users";
    const DOMAINS = "domains";
    const REMOTE_EXIT_NODES = "remoteExitNodes";

    // Confirmation dialog state
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [pendingTier, setPendingTier] = useState<{
        tier: Tier,
        action: "upgrade" | "downgrade";
        planName: string;
        price: string;
    } | null>(null);

    useEffect(() => {
        async function fetchSubscription() {
            setSubscriptionLoading(true);
            try {
                const res = await api.get<
                    AxiosResponse<GetOrgSubscriptionResponse>
                >(`/org/${org.org.orgId}/billing/subscriptions`);
                const { subscriptions } = res.data.data;
                setAllSubscriptions(subscriptions);

                // Find tier subscription
                const tierSub = subscriptions.find(
                    ({ subscription }) =>
                        subscription?.type === "tier1" ||
                        subscription?.type === "tier2" ||
                        subscription?.type === "tier3"
                );
                setTierSubscription(tierSub || null);

                if (tierSub?.subscription) {
                    setCurrentTier(
                        tierSub.subscription.type as Tier
                    );
                    setHasSubscription(
                        tierSub.subscription.status === "active"
                    );
                }

                // Find license subscription
                const licenseSub = subscriptions.find(
                    ({ subscription }) => subscription?.type === "license"
                );
                setLicenseSubscription(licenseSub || null);
            } catch (error) {
                toast({
                    title: t("billingFailedToLoadSubscription"),
                    description: formatAxiosError(error),
                    variant: "destructive"
                });
            } finally {
                setSubscriptionLoading(false);
            }
        }
        fetchSubscription();
    }, [org.org.orgId]);

    useEffect(() => {
        async function fetchUsage() {
            try {
                const res = await api.get<AxiosResponse<GetOrgUsageResponse>>(
                    `/org/${org.org.orgId}/billing/usage`
                );
                const { usage, limits } = res.data.data;
                setUsageData(usage);
                setLimitsData(limits);
            } catch (error) {
                toast({
                    title: t("billingFailedToLoadUsage"),
                    description: formatAxiosError(error),
                    variant: "destructive"
                });
            }
        }
        fetchUsage();
    }, [org.org.orgId]);

    const handleStartSubscription = async (
        tier: Tier
    ) => {
        setIsLoading(true);
        try {
            const response = await api.post<AxiosResponse<string>>(
                `/org/${org.org.orgId}/billing/create-checkout-session`,
                { tier }
            );
            const checkoutUrl = response.data.data;
            if (checkoutUrl) {
                window.location.href = checkoutUrl;
            } else {
                toast({
                    title: t("billingFailedToGetCheckoutUrl"),
                    description: t("billingPleaseTryAgainLater"),
                    variant: "destructive"
                });
                setIsLoading(false);
            }
        } catch (error) {
            toast({
                title: t("billingCheckoutError"),
                description: formatAxiosError(error),
                variant: "destructive"
            });
            setIsLoading(false);
        }
    };

    const handleModifySubscription = async () => {
        setIsLoading(true);
        try {
            const response = await api.post<AxiosResponse<string>>(
                `/org/${org.org.orgId}/billing/create-portal-session`,
                {}
            );
            const portalUrl = response.data.data;
            if (portalUrl) {
                window.location.href = portalUrl;
            } else {
                toast({
                    title: t("billingFailedToGetPortalUrl"),
                    description: t("billingPleaseTryAgainLater"),
                    variant: "destructive"
                });
                setIsLoading(false);
            }
        } catch (error) {
            toast({
                title: t("billingPortalError"),
                description: formatAxiosError(error),
                variant: "destructive"
            });
            setIsLoading(false);
        }
    };

    const handleChangeTier = async (tier: Tier) => {
        if (!hasSubscription) {
            // If no subscription, start a new one
            handleStartSubscription(tier);
            return;
        }

        setIsLoading(true);
        try {
            await api.post(`/org/${org.org.orgId}/billing/change-tier`, {
                tier
            });
            // Refresh subscription data
            window.location.reload();
        } catch (error) {
            toast({
                title: "Failed to change tier",
                description: formatAxiosError(error),
                variant: "destructive"
            });
            setIsLoading(false);
        }
    };

    const confirmTierChange = () => {
        if (!pendingTier) return;

        if (
            pendingTier.action === "upgrade" ||
            pendingTier.action === "downgrade"
        ) {
            if (hasSubscription) {
                handleChangeTier(pendingTier.tier);
            } else {
                handleStartSubscription(pendingTier.tier);
            }
        }

        setShowConfirmDialog(false);
        setPendingTier(null);
    };

    const showTierConfirmation = (
        tier: Tier,
        action: "upgrade" | "downgrade",
        planName: string,
        price: string
    ) => {
        setPendingTier({ tier, action, planName, price });
        setShowConfirmDialog(true);
    };

    const handleContactUs = () => {
        window.open("mailto:sales@pangolin.net", "_blank");
    };

    // Get current plan ID from tier
    const getCurrentPlanId = (): PlanId => {
        if (!hasSubscription || !currentTier) return "free";
        const plan = planOptions.find((p) => p.tierType === currentTier);
        return plan?.id || "free";
    };

    const currentPlanId = getCurrentPlanId();

    // Get button label and action for each plan
    const getPlanAction = (plan: PlanOption) => {
        if (plan.id === "enterprise") {
            return {
                label: "Contact Us",
                action: handleContactUs,
                variant: "outline" as const,
                disabled: false
            };
        }

        if (plan.id === currentPlanId) {
            // If it's the free plan (free with no subscription), show as current but disabled
            if (plan.id === "free" && !hasSubscription) {
                return {
                    label: "Current Plan",
                    action: () => {},
                    variant: "default" as const,
                    disabled: true
                };
            }
            return {
                label: "Modify Current Plan",
                action: handleModifySubscription,
                variant: "default" as const,
                disabled: false
            };
        }

        const currentIndex = planOptions.findIndex(
            (p) => p.id === currentPlanId
        );
        const planIndex = planOptions.findIndex((p) => p.id === plan.id);

        if (planIndex < currentIndex) {
            return {
                label: "Downgrade",
                action: () => {
                    if (plan.tierType) {
                        showTierConfirmation(
                            plan.tierType,
                            "downgrade",
                            plan.name,
                            plan.price + (plan.priceDetail || "")
                        );
                    } else {
                        handleModifySubscription();
                    }
                },
                variant: "outline" as const,
                disabled: false
            };
        }

        return {
            label: "Upgrade",
            action: () => {
                if (plan.tierType) {
                    showTierConfirmation(
                        plan.tierType,
                        "upgrade",
                        plan.name,
                        plan.price + (plan.priceDetail || "")
                    );
                } else {
                    handleModifySubscription();
                }
            },
            variant: "outline" as const,
            disabled: false
        };
    };

    // Get usage value by feature ID
    const getUsageValue = (featureId: string): number => {
        const usage = usageData.find((u) => u.featureId === featureId);
        return usage?.instantaneousValue || usage?.latestValue || 0;
    };

    // Get limit value by feature ID
    const getLimitValue = (featureId: string): number | null => {
        const limit = limitsData.find((l) => l.featureId === featureId);
        return limit?.value ?? null;
    };

    // Calculate current usage cost for display
    const getUserCount = () => getUsageValue(USERS);
    const getPricePerUser = () => {
        console.log("Calculating price per user, tierSubscription:", tierSubscription);
        if (!tierSubscription?.items) return 0;

        // Find the subscription item for USERS feature
        const usersItem = tierSubscription.items.find(
            (item) => item.planId === USERS
        );

        // unitAmount is in cents, convert to dollars
        if (usersItem?.unitAmount) {
            return usersItem.unitAmount / 100;
        }

        return 0;
    };

    // Get license key count
    const getLicenseKeyCount = (): number => {
        if (!licenseSubscription?.items) return 0;
        return licenseSubscription.items.length;
    };

    if (subscriptionLoading) {
        return (
            <div className="flex justify-center items-center h-64">
                <span>{t("billingLoadingSubscription")}</span>
            </div>
        );
    }

    return (
        <SettingsContainer>
            {/* Your Plan Section */}
            <SettingsSection>
                <SettingsSectionHeader>
                    <SettingsSectionTitle>
                        {t("billingYourPlan") || "Your Plan"}
                    </SettingsSectionTitle>
                    <SettingsSectionDescription>
                        {t("billingViewOrModifyPlan") ||
                            "View or modify your current plan"}
                    </SettingsSectionDescription>
                </SettingsSectionHeader>
                <SettingsSectionBody>
                    {/* Plan Cards Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                        {planOptions.map((plan) => {
                            const isCurrentPlan = plan.id === currentPlanId;
                            const planAction = getPlanAction(plan);

                            return (
                                <div
                                    key={plan.id}
                                    className={cn(
                                        "relative flex flex-col rounded-lg border p-4 transition-colors",
                                        isCurrentPlan
                                            ? "border-primary bg-primary/10"
                                            : "border-input hover:bg-accent/50"
                                    )}
                                >
                                    <div className="flex-1">
                                        <div className="text-2xl">
                                            {plan.name}
                                        </div>
                                        <div className="mt-1">
                                            <span className="text-xl">
                                                {plan.price}
                                            </span>
                                            {plan.priceDetail && (
                                                <span className="text-sm text-muted-foreground ml-1">
                                                    {plan.priceDetail}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="mt-4">
                                        <Button
                                            variant={
                                                isCurrentPlan
                                                    ? "default"
                                                    : "outline"
                                            }
                                            size="sm"
                                            className="w-full"
                                            onClick={planAction.action}
                                            disabled={
                                                isLoading || planAction.disabled
                                            }
                                        >
                                            {planAction.label}
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </SettingsSectionBody>
                <SettingsSectionFooter>
                    <Link
                        href="https://pangolin.net/pricing"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <Button variant="outline">
                            {t("billingViewPlanDetails") || "View Plan Details"}
                            <ExternalLink className="ml-2 h-4 w-4" />
                        </Button>
                    </Link>
                </SettingsSectionFooter>
            </SettingsSection>

            {/* Usage and Limits Section */}
            <SettingsSection>
                <SettingsSectionHeader>
                    <SettingsSectionTitle>
                        {t("billingUsageAndLimits") || "Usage and Limits"}
                    </SettingsSectionTitle>
                    <SettingsSectionDescription>
                        {t("billingViewUsageAndLimits") ||
                            "View your plan's limits and current usage"}
                    </SettingsSectionDescription>
                </SettingsSectionHeader>
                <SettingsSectionBody>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Current Usage */}
                        <div className="border rounded-lg p-4">
                            <div className="text-sm text-muted-foreground mb-2">
                                {t("billingCurrentUsage") || "Current Usage"}
                            </div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl font-bold">
                                    {getUserCount()}
                                </span>
                                <span className="text-lg">
                                    {t("billingUsers") || "Users"}
                                </span>
                                {hasSubscription && getPricePerUser() > 0 && (
                                    <div className="text-sm text-muted-foreground mt-1">
                                        x ${getPricePerUser()} / month = $
                                        {getUserCount() * getPricePerUser()} /
                                        month
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Maximum Limits */}
                        <div className="border rounded-lg p-4">
                            <div className="text-sm text-muted-foreground mb-3">
                                {t("billingMaximumLimits") || "Maximum Limits"}
                            </div>
                            <InfoSections cols={4}>
                                <InfoSection>
                                    <InfoSectionTitle className="flex items-center gap-1 text-xs">
                                        {t("billingUsers") || "Users"}
                                    </InfoSectionTitle>
                                    <InfoSectionContent className="text-sm">
                                        {getLimitValue(USERS) ??
                                            t("billingUnlimited") ??
                                            "∞"}{" "}
                                        {getLimitValue(USERS) !== null &&
                                            "users"}
                                    </InfoSectionContent>
                                </InfoSection>
                                <InfoSection>
                                    <InfoSectionTitle className="flex items-center gap-1 text-xs">
                                        {t("billingSites") || "Sites"}
                                    </InfoSectionTitle>
                                    <InfoSectionContent className="text-sm">
                                        {getLimitValue(SITES) ??
                                            t("billingUnlimited") ??
                                            "∞"}{" "}
                                        {getLimitValue(SITES) !== null &&
                                            "sites"}
                                    </InfoSectionContent>
                                </InfoSection>
                                <InfoSection>
                                    <InfoSectionTitle className="flex items-center gap-1 text-xs">
                                        {t("billingDomains") || "Domains"}
                                    </InfoSectionTitle>
                                    <InfoSectionContent className="text-sm">
                                        {getLimitValue(DOMAINS) ??
                                            t("billingUnlimited") ??
                                            "∞"}{" "}
                                        {getLimitValue(DOMAINS) !== null &&
                                            "domains"}
                                    </InfoSectionContent>
                                </InfoSection>
                                <InfoSection>
                                    <InfoSectionTitle className="flex items-center gap-1 text-xs">
                                        {t("billingRemoteNodes") ||
                                            "Remote Nodes"}
                                    </InfoSectionTitle>
                                    <InfoSectionContent className="text-sm">
                                        {getLimitValue(REMOTE_EXIT_NODES) ??
                                            t("billingUnlimited") ??
                                            "∞"}{" "}
                                        {getLimitValue(REMOTE_EXIT_NODES) !==
                                            null && "remote nodes"}
                                    </InfoSectionContent>
                                </InfoSection>
                            </InfoSections>
                        </div>
                    </div>
                </SettingsSectionBody>
            </SettingsSection>

            {/* Paid License Keys Section */}
            {(licenseSubscription || getLicenseKeyCount() > 0) && (
                <SettingsSection>
                    <SettingsSectionHeader>
                        <SettingsSectionTitle>
                            {t("billingPaidLicenseKeys") || "Paid License Keys"}
                        </SettingsSectionTitle>
                        <SettingsSectionDescription>
                            {t("billingManageLicenseSubscription") ||
                                "Manage your subscription for paid self-hosted license keys"}
                        </SettingsSectionDescription>
                    </SettingsSectionHeader>
                    <SettingsSectionBody>
                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border rounded-lg p-4 bg-muted/30">
                            <div>
                                <div className="text-sm text-muted-foreground mb-1">
                                    {t("billingCurrentKeys") || "Current Keys"}
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-3xl font-bold">
                                        {getLicenseKeyCount()}
                                    </span>
                                    <span className="text-lg">
                                        {getLicenseKeyCount() === 1
                                            ? "key"
                                            : "keys"}
                                    </span>
                                </div>
                            </div>
                            <Button
                                variant="outline"
                                onClick={handleModifySubscription}
                                disabled={isLoading}
                            >
                                <CreditCard className="mr-2 h-4 w-4" />
                                {t("billingModifyCurrentPlan") ||
                                    "Modify Current Plan"}
                            </Button>
                        </div>
                    </SettingsSectionBody>
                </SettingsSection>
            )}

            {/* Tier Change Confirmation Dialog */}
            <Credenza
                open={showConfirmDialog}
                onOpenChange={setShowConfirmDialog}
            >
                <CredenzaContent>
                    <CredenzaHeader>
                        <CredenzaTitle>
                            {pendingTier?.action === "upgrade"
                                ? t("billingConfirmUpgrade") ||
                                  "Confirm Upgrade"
                                : t("billingConfirmDowngrade") ||
                                  "Confirm Downgrade"}
                        </CredenzaTitle>
                        <CredenzaDescription>
                            {pendingTier?.action === "upgrade"
                                ? t("billingConfirmUpgradeDescription") ||
                                  `You are about to upgrade to the ${pendingTier?.planName} plan.`
                                : t("billingConfirmDowngradeDescription") ||
                                  `You are about to downgrade to the ${pendingTier?.planName} plan.`}
                        </CredenzaDescription>
                    </CredenzaHeader>
                    <CredenzaBody>
                        {pendingTier && pendingTier.tier && (
                            <div className="space-y-4">
                                <div className="border rounded-lg p-4 bg-muted/30">
                                    <div className="font-semibold text-lg mb-2">
                                        {pendingTier.planName}
                                    </div>
                                    <div className="text-2xl font-bold">
                                        {pendingTier.price}
                                    </div>
                                </div>

                                <div>
                                    <h4 className="font-semibold mb-3">
                                        {t("billingPlanIncludes") ||
                                            "Plan Includes:"}
                                    </h4>
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <Check className="h-4 w-4 text-green-600" />
                                            <span>
                                                {
                                                    tierLimits[pendingTier.tier]
                                                        .sites
                                                }{" "}
                                                {t("billingSites") || "Sites"}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Check className="h-4 w-4 text-green-600" />
                                            <span>
                                                {
                                                    tierLimits[pendingTier.tier]
                                                        .users
                                                }{" "}
                                                {t("billingUsers") || "Users"}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Check className="h-4 w-4 text-green-600" />
                                            <span>
                                                {
                                                    tierLimits[pendingTier.tier]
                                                        .domains
                                                }{" "}
                                                {t("billingDomains") ||
                                                    "Domains"}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Check className="h-4 w-4 text-green-600" />
                                            <span>
                                                {
                                                    tierLimits[pendingTier.tier]
                                                        .remoteNodes
                                                }{" "}
                                                {t("billingRemoteNodes") ||
                                                    "Remote Nodes"}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </CredenzaBody>
                    <CredenzaFooter>
                        <CredenzaClose asChild>
                            <Button variant="outline" disabled={isLoading}>
                                {t("cancel") || "Cancel"}
                            </Button>
                        </CredenzaClose>
                        <Button
                            onClick={confirmTierChange}
                            disabled={isLoading}
                        >
                            {isLoading
                                ? t("billingProcessing") || "Processing..."
                                : pendingTier?.action === "upgrade"
                                  ? t("billingConfirmUpgradeButton") ||
                                    "Confirm Upgrade"
                                  : t("billingConfirmDowngradeButton") ||
                                    "Confirm Downgrade"}
                        </Button>
                    </CredenzaFooter>
                </CredenzaContent>
            </Credenza>
        </SettingsContainer>
    );
}
