"use client";

import { useQuery } from "@tanstack/react-query";
import { orgQueries } from "@app/lib/queries";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger
} from "@app/components/ui/tooltip";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { createApiClient } from "@app/lib/api";
import { cn } from "@app/lib/cn";

function formatDuration(seconds: number): string {
    if (seconds === 0) return "0s";
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.round(seconds % 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0 && s > 0) return `${m}m ${s}s`;
    return `${m}m`;
}

function formatDate(dateStr: string): string {
    return new Date(dateStr + "T00:00:00").toLocaleDateString([], {
        month: "short",
        day: "numeric"
    });
}

const barColorClass: Record<string, string> = {
    good: "bg-green-500",
    degraded: "bg-yellow-500",
    bad: "bg-red-500",
    no_data: "bg-zinc-700"
};

type UptimeMiniBarProps = {
    siteId?: number;
    targetId?: number;
    days?: number;
};

export default function UptimeMiniBar({
    siteId,
    targetId,
    days = 30
}: UptimeMiniBarProps) {
    const api = createApiClient(useEnvContext());

    const siteQuery = useQuery({
        ...orgQueries.siteStatusHistory({ siteId: siteId ?? 0, days }),
        enabled: siteId != null,
        meta: { api }
    });

    const hcQuery = useQuery({
        ...orgQueries.healthCheckStatusHistory({ targetId: targetId ?? 0, days }),
        enabled: targetId != null && siteId == null,
        meta: { api }
    });

    const { data, isLoading } = siteId != null ? siteQuery : hcQuery;

    if (isLoading) {
        return (
            <div className="flex items-center gap-2">
                <div className="flex gap-px h-5 w-24">
                    {Array.from({ length: days }).map((_, i) => (
                        <div
                            key={i}
                            className="flex-1 rounded-[2px] bg-zinc-800 animate-pulse"
                        />
                    ))}
                </div>
                <span className="text-xs text-muted-foreground w-12">—</span>
            </div>
        );
    }

    if (!data) return null;

    const allNoData = data.days.every((d) => d.status === "no_data");

    return (
        <div className="flex items-center gap-2">
            <div
                className="flex gap-px h-5"
                style={{ width: `${days * 5}px` }}
            >
                {data.days.map((day, i) => (
                    <Tooltip key={i}>
                        <TooltipTrigger asChild>
                            <div
                                className={cn(
                                    "flex-1 rounded-[2px] cursor-default transition-opacity hover:opacity-75",
                                    barColorClass[day.status]
                                )}
                            />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="p-2 space-y-0.5">
                            <div className="font-semibold text-xs">
                                {formatDate(day.date)}
                            </div>
                            <div className="text-xs text-primary-foreground/80">
                                {day.status === "no_data"
                                    ? "No data"
                                    : `${day.uptimePercent.toFixed(1)}% uptime`}
                            </div>
                            {day.totalDowntimeSeconds > 0 && (
                                <div className="text-xs text-primary-foreground/70">
                                    Down:{" "}
                                    {formatDuration(day.totalDowntimeSeconds)}
                                </div>
                            )}
                        </TooltipContent>
                    </Tooltip>
                ))}
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
                {allNoData
                    ? "No data"
                    : `${data.overallUptimePercent.toFixed(1)}%`}
            </span>
        </div>
    );
}