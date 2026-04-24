"use client";

import { Button } from "@app/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@app/components/ui/dropdown-menu";
import { cn } from "@app/lib/cn";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

export type ResourceSiteRow = {
    siteId: number;
    siteName: string;
    siteNiceId: string;
    online: boolean;
};

type AggregateSitesStatus = "allOnline" | "partial" | "allOffline";

function aggregateSitesStatus(
    resourceSites: ResourceSiteRow[]
): AggregateSitesStatus {
    if (resourceSites.length === 0) {
        return "allOffline";
    }
    const onlineCount = resourceSites.filter((rs) => rs.online).length;
    if (onlineCount === resourceSites.length) return "allOnline";
    if (onlineCount > 0) return "partial";
    return "allOffline";
}

function aggregateStatusDotClass(status: AggregateSitesStatus): string {
    switch (status) {
        case "allOnline":
            return "bg-green-500";
        case "partial":
            return "bg-yellow-500";
        case "allOffline":
        default:
            return "bg-neutral-500";
    }
}

export function ResourceSitesStatusCell({
    orgId,
    resourceSites
}: {
    orgId: string;
    resourceSites: ResourceSiteRow[];
}) {
    const t = useTranslations();

    if (resourceSites.length === 0) {
        return <span>-</span>;
    }

    const aggregate = aggregateSitesStatus(resourceSites);
    const countLabel = t("multiSitesSelectorSitesCount", {
        count: resourceSites.length
    });

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className="flex h-8 items-center gap-2 px-0 font-normal"
                >
                    <div
                        className={cn(
                            "h-2 w-2 shrink-0 rounded-full",
                            aggregateStatusDotClass(aggregate)
                        )}
                    />
                    <span className="text-sm tabular-nums">{countLabel}</span>
                    <ChevronDown className="h-3 w-3 shrink-0" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-56">
                {resourceSites.map((site) => {
                    const isOnline = site.online;
                    return (
                        <DropdownMenuItem key={site.siteId} asChild>
                            <Link
                                href={`/${orgId}/settings/sites/${site.siteNiceId}`}
                                className="flex cursor-pointer items-center justify-between gap-4"
                            >
                                <div className="flex min-w-0 items-center gap-2">
                                    <div
                                        className={cn(
                                            "h-2 w-2 shrink-0 rounded-full",
                                            isOnline
                                                ? "bg-green-500"
                                                : "bg-neutral-500"
                                        )}
                                    />
                                    <span className="truncate">
                                        {site.siteName}
                                    </span>
                                </div>
                                <span
                                    className={cn(
                                        "shrink-0 capitalize",
                                        isOnline
                                            ? "text-green-600"
                                            : "text-muted-foreground"
                                    )}
                                >
                                    {isOnline ? t("online") : t("offline")}
                                </span>
                            </Link>
                        </DropdownMenuItem>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
