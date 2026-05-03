"use client";

import { cn } from "@app/lib/cn";
import { useSubscriptionStatusContext } from "@app/hooks/useSubscriptionStatusContext";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ClockIcon, ArrowRight } from "lucide-react";
import { ProgressBackwards } from "@app/components/ui/progress-backwards";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger
} from "@app/components/ui/tooltip";
import { useTranslations } from "next-intl";

const TRIAL_DURATION_DAYS = 10;

export default function ShowTrialCard({
    isCollapsed
}: {
    isCollapsed?: boolean;
}) {
    const context = useSubscriptionStatusContext();
    const params = useParams();
    const orgId = params?.orgId as string | undefined;
    const t = useTranslations();

    const trialExpiresAt = context?.trialExpiresAt ?? null;

    if (trialExpiresAt == null) return null;

    const now = Date.now();
    const remainingMs = trialExpiresAt - now;
    const remainingDays = Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));
    const totalMs = TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000;
    const progressPct = Math.min(100, Math.max(0, ((now - (trialExpiresAt - totalMs)) / totalMs) * 100));
    // Inverted: full bar at start, drains to empty as trial ends
    const displayPct = 100 - progressPct;

    const billingHref = orgId ? `/${orgId}/settings/billing` : "/";

    if (isCollapsed) {
        return (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Link
                            href={billingHref}
                            className="flex items-center justify-center rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-secondary/80 dark:hover:bg-secondary/50 transition-colors"
                        >
                            <ClockIcon className="h-4 w-4 flex-none" />
                        </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8}>
                        <p>
                            {remainingDays === 0
                                ? t("trialExpired")
                                : t("trialDaysLeftShort", { days: remainingDays })}
                        </p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    }

    return (
        <Link
            href={billingHref}
            className={cn(
                "group cursor-pointer block",
                "rounded-md border bg-secondary p-2 py-3 w-full flex flex-col gap-2 text-sm",
                "transition duration-200 ease-in-out hover:bg-secondary/80 dark:hover:bg-secondary/60"
            )}
        >
            <div className="flex items-center gap-2">
                <ClockIcon className="flex-none size-4 text-muted-foreground" />
                <p className="font-medium flex-1 leading-tight">
                    {remainingDays === 0
                        ? t("trialExpired")
                        : t("trialActive")}
                </p>
            </div>
            <div className="flex flex-col gap-1.5">
                <ProgressBackwards value={displayPct} className="h-1.5" />
                <small className="text-muted-foreground">
                    {remainingDays === 0
                        ? t("trialHasEnded")
                        : t("trialDaysRemaining", { count: remainingDays })}
                </small>
                <div className="inline-flex items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                    <span>{t("trialGoToBilling")}</span>
                    <ArrowRight className="flex-none size-3" />
                </div>
            </div>
        </Link>
    );
}
