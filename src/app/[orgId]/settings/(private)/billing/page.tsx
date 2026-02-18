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
import { CreditCard, ExternalLink, Check, AlertTriangle } from "lucide-react";
import {
    Alert,
    AlertTitle,
    AlertDescription
} from "@app/components/ui/alert";
import {
    Tooltip,
    TooltipTrigger,
    TooltipContent
} from "@app/components/ui/tooltip";
import {
    GetOrgSubscriptionResponse,
    GetOrgUsageResponse
} from "@server/routers/billing/types";
import { useTranslations } from "use-intl";
import Link from "next/link";
import { Tier } from "@server/types/Tiers";
import {
    freeLimitSet,
    tier1LimitSet,
    tier2LimitSet,
    tier3LimitSet
} from "@server/lib/billing/limitSet";
import { FeatureId } from "@server/lib/billing/features";

// Plan tier definitions matching the mockup
type PlanId = "basic" | "home" | "team" | "business" | "enterprise";

type PlanOption = {
    id: PlanId;
    name: string;
    price: string;
    priceDetail?: string;
    tierType: Tier | null;
};

const planOptions: PlanOption[] = [
    {
        id: "basic",
        name: "Basic",
        price: "Free",
        tierType: null
    },
    {
        id: "home",
        name: "Home",
        price: "$12.50",
        priceDetail: "/ month",
        tierType: "tier1"
    },
    {
        id: "team",
        name: "Team",
        price: "$4",
        priceDetail: "per user / month",
        tierType: "tier2"
    },
    {
        id: "business",
        name: "Business",
        price: "$9",
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

// Tier limits mapping derived from limit sets
const tierLimits: Record<
    Tier | "basic",
    { users: number; sites: number; domains: number; remoteNodes: number; organizations: number }
> = {
    basic: {
        users: freeLimitSet[FeatureId.USERS]?.value ?? 0,
        sites: freeLimitSet[FeatureId.SITES]?.value ?? 0,
        domains: freeLimitSet[FeatureId.DOMAINS]?.value ?? 0,
        remoteNodes: freeLimitSet[FeatureId.REMOTE_EXIT_NODES]?.value ?? 0,
        organizations: freeLimitSet[FeatureId.ORGINIZATIONS]?.value ?? 0
    },
    tier1: {
        users: tier1LimitSet[FeatureId.USERS]?.value ?? 0,
        sites: tier1LimitSet[FeatureId.SITES]?.value ?? 0,
        domains: tier1LimitSet[FeatureId.DOMAINS]?.value ?? 0,
        remoteNodes: tier1LimitSet[FeatureId.REMOTE_EXIT_NODES]?.value ?? 0,
        organizations: tier1LimitSet[FeatureId.ORGINIZATIONS]?.value ?? 0
    },
    tier2: {
        users: tier2LimitSet[FeatureId.USERS]?.value ?? 0,
        sites: tier2LimitSet[FeatureId.SITES]?.value ?? 0,
        domains: tier2LimitSet[FeatureId.DOMAINS]?.value ?? 0,
        remoteNodes: tier2LimitSet[FeatureId.REMOTE_EXIT_NODES]?.value ?? 0,
        organizations: tier2LimitSet[FeatureId.ORGINIZATIONS]?.value ?? 0
    },
    tier3: {
        users: tier3LimitSet[FeatureId.USERS]?.value ?? 0,
        sites: tier3LimitSet[FeatureId.SITES]?.value ?? 0,
        domains: tier3LimitSet[FeatureId.DOMAINS]?.value ?? 0,
        remoteNodes: tier3LimitSet[FeatureId.REMOTE_EXIT_NODES]?.value ?? 0,
        organizations: tier3LimitSet[FeatureId.ORGINIZATIONS]?.value ?? 0
    },
    enterprise: {
        users: 0, // Custom for enterprise
        sites: 0, // Custom for enterprise
        domains: 0, // Custom for enterprise
        remoteNodes: 0, // Custom for enterprise
        organizations: 0 // Custom for enterprise
    }
};

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
    const [currentTier, setCurrentTier] = useState<Tier | null>(null);

    // Usage IDs
    const USERS = "users";
    const SITES = "sites";
    const DOMAINS = "domains";
    const REMOTE_EXIT_NODES = "remoteExitNodes";
    const ORGINIZATIONS = "organizations";

    // Confirmation dialog state
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [pendingTier, setPendingTier] = useState<{
        tier: Tier | "basic";
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
                    setCurrentTier(tierSub.subscription.type as Tier);
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

    const handleStartSubscription = async (tier: Tier) => {
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

            // Poll the API to check if the tier change has been reflected
            const pollForTierChange = async (targetTier: Tier) => {
                const maxAttempts = 30; // 30 seconds with 1 second interval
                let attempts = 0;

                const poll = async (): Promise<boolean> => {
                    try {
                        const res = await api.get<
                            AxiosResponse<GetOrgSubscriptionResponse>
                        >(`/org/${org.org.orgId}/billing/subscriptions`);
                        const { subscriptions } = res.data.data;

                        // Find tier subscription
                        const tierSub = subscriptions.find(
                            ({ subscription }) =>
                                subscription?.type === "tier1" ||
                                subscription?.type === "tier2" ||
                                subscription?.type === "tier3"
                        );

                        // Check if the tier has changed to the target tier
                        if (tierSub?.subscription?.type === targetTier) {
                            return true;
                        }

                        return false;
                    } catch (error) {
                        console.error("Error polling subscription:", error);
                        return false;
                    }
                };

                while (attempts < maxAttempts) {
                    const success = await poll();

                    if (success) {
                        // Tier change reflected, refresh the page
                        window.location.reload();
                        return;
                    }

                    attempts++;

                    if (attempts < maxAttempts) {
                        // Wait 1 second before next poll
                        await new Promise((resolve) =>
                            setTimeout(resolve, 1000)
                        );
                    }
                }

                // If we've exhausted all attempts, show an error
                toast({
                    title: "Tier change processing",
                    description:
                        "Your tier change is taking longer than expected. Please refresh the page in a moment to see the changes.",
                    variant: "destructive"
                });
                setIsLoading(false);
            };

            // Start polling for the tier change
            pollForTierChange(tier);
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
            // If downgrading to basic (free tier), go to Stripe portal
            if (pendingTier.tier === "basic") {
                handleModifySubscription();
            } else if (hasSubscription) {
                handleChangeTier(pendingTier.tier);
            } else {
                handleStartSubscription(pendingTier.tier);
            }
        }

        // setShowConfirmDialog(false);
        // setPendingTier(null);
    };

    const showTierConfirmation = (
        tier: Tier | "basic",
        action: "upgrade" | "downgrade",
        planName: string,
        price: string
    ) => {
        setPendingTier({ tier, action, planName, price });
        setShowConfirmDialog(true);
    };

    const handleContactUs = () => {
        window.open("https://pangolin.net/talk-to-us", "_blank");
    };

    // Get current plan ID from tier
    const getCurrentPlanId = (): PlanId => {
        if (!hasSubscription || !currentTier) return "basic";
        const plan = planOptions.find((p) => p.tierType === currentTier);
        return plan?.id || "basic";
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
            // If it's the basic plan (basic with no subscription), show as current but disabled
            if (plan.id === "basic" && !hasSubscription) {
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
                            plan.price + (" " + plan.priceDetail || "")
                        );
                    } else if (plan.id === "basic") {
                        // Show confirmation for downgrading to basic (free tier)
                        showTierConfirmation(
                            "basic",
                            "downgrade",
                            plan.name,
                            plan.price
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
                        plan.price + (" " + plan.priceDetail || "")
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

    // Check if usage exceeds limit for a specific feature
    const isOverLimit = (featureId: string): boolean => {
        const usage = getUsageValue(featureId);
        const limit = getLimitValue(featureId);
        return limit !== null && usage > limit;
    };

    // Calculate current usage cost for display
    const getUserCount = () => getUsageValue(USERS);
    const getPricePerUser = () => {
        if (!tierSubscription?.items) return 0;

        // Find the subscription item for USERS feature
        const usersItem = tierSubscription.items.find(
            (item) => item.featureId === USERS
        );

        console.log("Users subscription item:", usersItem);

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

    // Check if downgrading to a tier would violate current usage limits
    const checkLimitViolations = (targetTier: Tier | "basic"): Array<{
        feature: string;
        currentUsage: number;
        newLimit: number;
    }> => {
        const violations: Array<{
            feature: string;
            currentUsage: number;
            newLimit: number;
        }> = [];

        const limits = tierLimits[targetTier];

        // Check users
        const usersUsage = getUsageValue(USERS);
        if (limits.users > 0 && usersUsage > limits.users) {
            violations.push({
                feature: "Users",
                currentUsage: usersUsage,
                newLimit: limits.users
            });
        }

        // Check sites
        const sitesUsage = getUsageValue(SITES);
        if (limits.sites > 0 && sitesUsage > limits.sites) {
            violations.push({
                feature: "Sites",
                currentUsage: sitesUsage,
                newLimit: limits.sites
            });
        }

        // Check domains
        const domainsUsage = getUsageValue(DOMAINS);
        if (limits.domains > 0 && domainsUsage > limits.domains) {
            violations.push({
                feature: "Domains",
                currentUsage: domainsUsage,
                newLimit: limits.domains
            });
        }

        // Check remote nodes
        const remoteNodesUsage = getUsageValue(REMOTE_EXIT_NODES);
        if (limits.remoteNodes > 0 && remoteNodesUsage > limits.remoteNodes) {
            violations.push({
                feature: "Remote Exit Nodes",
                currentUsage: remoteNodesUsage,
                newLimit: limits.remoteNodes
            });
        }

        // Check organizations
        const organizationsUsage = getUsageValue(ORGINIZATIONS);
        if (limits.organizations > 0 && organizationsUsage > limits.organizations) {
            violations.push({
                feature: "Organizations",
                currentUsage: organizationsUsage,
                newLimit: limits.organizations
            });
        }

        return violations;
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
                                            loading={isLoading && isCurrentPlan}
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
                            <InfoSections cols={5}>
                                <InfoSection>
                                    <InfoSectionTitle className="flex items-center gap-1 text-xs">
                                        {t("billingUsers") || "Users"}
                                    </InfoSectionTitle>
                                    <InfoSectionContent className="text-sm">
                                        {isOverLimit(USERS) ? (
                                            <Tooltip>
                                                <TooltipTrigger className="flex items-center gap-1">
                                                    <AlertTriangle className="h-3 w-3 text-orange-400" />
                                                    <span className={cn(
                                                        "text-orange-600 dark:text-orange-400 font-medium"
                                                    )}>
                                                        {getLimitValue(USERS) ??
                                                            t("billingUnlimited") ??
                                                            "∞"}{" "}
                                                        {getLimitValue(USERS) !== null &&
                                                            "users"}
                                                    </span>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>{t("billingUsageExceedsLimit", { current: getUsageValue(USERS), limit: getLimitValue(USERS) ?? 0 }) || `Current usage (${getUsageValue(USERS)}) exceeds limit (${getLimitValue(USERS)})`}</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        ) : (
                                            <>
                                                {getLimitValue(USERS) ??
                                                    t("billingUnlimited") ??
                                                    "∞"}{" "}
                                                {getLimitValue(USERS) !== null &&
                                                    "users"}
                                            </>
                                        )}
                                    </InfoSectionContent>
                                </InfoSection>
                                <InfoSection>
                                    <InfoSectionTitle className="flex items-center gap-1 text-xs">
                                        {t("billingSites") || "Sites"}
                                    </InfoSectionTitle>
                                    <InfoSectionContent className="text-sm">
                                        {isOverLimit(SITES) ? (
                                            <Tooltip>
                                                <TooltipTrigger className="flex items-center gap-1">
                                                    <AlertTriangle className="h-3 w-3 text-orange-400" />
                                                    <span className={cn(
                                                        "text-orange-600 dark:text-orange-400 font-medium"
                                                    )}>
                                                        {getLimitValue(SITES) ??
                                                            t("billingUnlimited") ??
                                                            "∞"}{" "}
                                                        {getLimitValue(SITES) !== null &&
                                                            "sites"}
                                                    </span>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>{t("billingUsageExceedsLimit", { current: getUsageValue(SITES), limit: getLimitValue(SITES) ?? 0 }) || `Current usage (${getUsageValue(SITES)}) exceeds limit (${getLimitValue(SITES)})`}</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        ) : (
                                            <>
                                                {getLimitValue(SITES) ??
                                                    t("billingUnlimited") ??
                                                    "∞"}{" "}
                                                {getLimitValue(SITES) !== null &&
                                                    "sites"}
                                            </>
                                        )}
                                    </InfoSectionContent>
                                </InfoSection>
                                <InfoSection>
                                    <InfoSectionTitle className="flex items-center gap-1 text-xs">
                                        {t("billingDomains") || "Domains"}
                                    </InfoSectionTitle>
                                    <InfoSectionContent className="text-sm">
                                        {isOverLimit(DOMAINS) ? (
                                            <Tooltip>
                                                <TooltipTrigger className="flex items-center gap-1">
                                                    <AlertTriangle className="h-3 w-3 text-orange-400" />
                                                    <span className={cn(
                                                        "text-orange-600 dark:text-orange-400 font-medium"
                                                    )}>
                                                        {getLimitValue(DOMAINS) ??
                                                            t("billingUnlimited") ??
                                                            "∞"}{" "}
                                                        {getLimitValue(DOMAINS) !== null &&
                                                            "domains"}
                                                    </span>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>{t("billingUsageExceedsLimit", { current: getUsageValue(DOMAINS), limit: getLimitValue(DOMAINS) ?? 0 }) || `Current usage (${getUsageValue(DOMAINS)}) exceeds limit (${getLimitValue(DOMAINS)})`}</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        ) : (
                                            <>
                                                {getLimitValue(DOMAINS) ??
                                                    t("billingUnlimited") ??
                                                    "∞"}{" "}
                                                {getLimitValue(DOMAINS) !== null &&
                                                    "domains"}
                                            </>
                                        )}
                                    </InfoSectionContent>
                                </InfoSection>
                                <InfoSection>
                                    <InfoSectionTitle className="flex items-center gap-1 text-xs">
                                        {t("billingOrganizations") ||
                                            "Organizations"}
                                    </InfoSectionTitle>
                                    <InfoSectionContent className="text-sm">
                                        {isOverLimit(ORGINIZATIONS) ? (
                                            <Tooltip>
                                                <TooltipTrigger className="flex items-center gap-1">
                                                    <AlertTriangle className="h-3 w-3 text-orange-400" />
                                                    <span className={cn(
                                                        "text-orange-600 dark:text-orange-400 font-medium"
                                                    )}>
                                                        {getLimitValue(ORGINIZATIONS) ??
                                                            t("billingUnlimited") ??
                                                            "∞"}{" "}
                                                        {getLimitValue(ORGINIZATIONS) !==
                                                            null && "orgs"}
                                                    </span>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>{t("billingUsageExceedsLimit", { current: getUsageValue(ORGINIZATIONS), limit: getLimitValue(ORGINIZATIONS) ?? 0 }) || `Current usage (${getUsageValue(ORGINIZATIONS)}) exceeds limit (${getLimitValue(ORGINIZATIONS)})`}</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        ) : (
                                            <>
                                                {getLimitValue(ORGINIZATIONS) ??
                                                    t("billingUnlimited") ??
                                                    "∞"}{" "}
                                                {getLimitValue(ORGINIZATIONS) !==
                                                    null && "orgs"}
                                            </>
                                        )}
                                    </InfoSectionContent>
                                </InfoSection>
                                <InfoSection>
                                    <InfoSectionTitle className="flex items-center gap-1 text-xs">
                                        {t("billingRemoteNodes") ||
                                            "Remote Nodes"}
                                    </InfoSectionTitle>
                                    <InfoSectionContent className="text-sm">
                                        {isOverLimit(REMOTE_EXIT_NODES) ? (
                                            <Tooltip>
                                                <TooltipTrigger className="flex items-center gap-1">
                                                    <AlertTriangle className="h-3 w-3 text-orange-400" />
                                                    <span className={cn(
                                                        "text-orange-600 dark:text-orange-400 font-medium"
                                                    )}>
                                                        {getLimitValue(REMOTE_EXIT_NODES) ??
                                                            t("billingUnlimited") ??
                                                            "∞"}{" "}
                                                        {getLimitValue(REMOTE_EXIT_NODES) !==
                                                            null && "nodes"}
                                                    </span>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>{t("billingUsageExceedsLimit", { current: getUsageValue(REMOTE_EXIT_NODES), limit: getLimitValue(REMOTE_EXIT_NODES) ?? 0 }) || `Current usage (${getUsageValue(REMOTE_EXIT_NODES)}) exceeds limit (${getLimitValue(REMOTE_EXIT_NODES)})`}</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        ) : (
                                            <>
                                                {getLimitValue(REMOTE_EXIT_NODES) ??
                                                    t("billingUnlimited") ??
                                                    "∞"}{" "}
                                                {getLimitValue(REMOTE_EXIT_NODES) !==
                                                    null && "nodes"}
                                            </>
                                        )}
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
                        <div className="w-full md:w-1/2">
                            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border rounded-lg p-4">
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
                                    loading={isLoading}
                                >
                                    <CreditCard className="mr-2 h-4 w-4" />
                                    {t("billingModifyCurrentPlan") ||
                                        "Modify Current Plan"}
                                </Button>
                            </div>
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
                                <div className="border rounded-lg p-4">
                                    <div className="text-2xl">
                                        {pendingTier.planName}
                                    </div>
                                    <div className="mt-1">
                                        <span className="text-xl">
                                            {pendingTier.price}
                                        </span>
                                    </div>
                                </div>

                                {tierLimits[pendingTier.tier] && (
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
                                                            .organizations
                                                    }{" "}
                                                    {t("billingOrganizations") ||
                                                        "Organizations"}
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
                                )}

                                {/* Warning for limit violations when downgrading */}
                                {pendingTier.action === "downgrade" && (() => {
                                    const violations = checkLimitViolations(pendingTier.tier);
                                    if (violations.length > 0) {
                                        return (
                                            <Alert variant="destructive">
                                                <AlertTriangle className="h-4 w-4" />
                                                <AlertTitle>
                                                    {t("billingLimitViolationWarning") || "Usage Exceeds New Plan Limits"}
                                                </AlertTitle>
                                                <AlertDescription>
                                                    <p className="mb-3">
                                                        {t("billingLimitViolationDescription") || "Your current usage exceeds the limits of this plan. The following features will be disabled until you reduce usage:"}
                                                    </p>
                                                    <ul className="space-y-2">
                                                        {violations.map((violation, index) => (
                                                            <li key={index} className="flex items-center gap-2">
                                                                <span className="font-medium">{violation.feature}:</span>
                                                                <span>Currently using {violation.currentUsage}, new limit is {violation.newLimit}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </AlertDescription>
                                            </Alert>
                                        );
                                    }
                                    return null;
                                })()}

                                {/* Warning for feature loss when downgrading */}
                                {pendingTier.action === "downgrade" && (
                                    <Alert variant="warning">
                                        <AlertTriangle className="h-4 w-4" />
                                        <AlertTitle>
                                            {t("billingFeatureLossWarning") || "Feature Availability Notice"}
                                        </AlertTitle>
                                        <AlertDescription>
                                            {t("billingFeatureLossDescription") || "By downgrading, features not available in the new plan will be automatically disabled. Some settings and configurations may be lost. Please review the pricing matrix to understand which features will no longer be available."}
                                        </AlertDescription>
                                    </Alert>
                                )}
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
                            loading={isLoading}
                        >
                            {pendingTier?.action === "upgrade"
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
