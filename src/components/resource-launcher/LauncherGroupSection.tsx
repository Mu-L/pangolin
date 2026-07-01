"use client";

import {
    Collapsible,
    CollapsibleContent
} from "@app/components/ui/collapsible";
import { cn } from "@app/lib/cn";
import {
    readLauncherGroupOpen,
    writeLauncherGroupOpen,
    type LauncherActiveViewId
} from "@app/lib/launcherLocalStorage";
import { launcherQueries } from "@app/lib/queries";
import type {
    LauncherGroup,
    LauncherViewConfig
} from "@server/routers/launcher/types";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { LauncherGroupTrigger } from "./LauncherGroupTrigger";
import { LauncherResourceGrid } from "./LauncherResourceGrid";
import { LauncherResourceList } from "./LauncherResourceList";

type LauncherGroupSectionProps = {
    orgId: string;
    activeViewId: LauncherActiveViewId;
    group: LauncherGroup;
    config: LauncherViewConfig;
    searchQuery: string;
    defaultOpen?: boolean;
};

export function LauncherGroupSection({
    orgId,
    activeViewId,
    group,
    config,
    searchQuery,
    defaultOpen = true
}: LauncherGroupSectionProps) {
    const t = useTranslations();
    const loadMoreRef = useRef<HTMLDivElement | null>(null);
    const [isOpen, setIsOpen] = useState(() =>
        readLauncherGroupOpen(
            orgId,
            activeViewId,
            config.groupBy,
            group.groupKey,
            defaultOpen
        )
    );

    useEffect(() => {
        setIsOpen(
            readLauncherGroupOpen(
                orgId,
                activeViewId,
                config.groupBy,
                group.groupKey,
                defaultOpen
            )
        );
    }, [activeViewId, config.groupBy, defaultOpen, group.groupKey, orgId]);

    const handleOpenChange = (open: boolean) => {
        setIsOpen(open);
        writeLauncherGroupOpen(
            orgId,
            activeViewId,
            config.groupBy,
            group.groupKey,
            open
        );
    };

    const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
        useInfiniteQuery({
            ...launcherQueries.resources(orgId, {
                query: searchQuery,
                groupBy: config.groupBy,
                groupKey: group.groupKey,
                siteIds: config.siteIds,
                labelIds: config.labelIds,
                sort_by: config.sortBy,
                order: config.order,
                pageSize: 20
            }),
            enabled: isOpen
        });

    const resources = data?.pages.flatMap((page) => page.resources) ?? [];

    useEffect(() => {
        const node = loadMoreRef.current;
        if (!node || !hasNextPage) {
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting && !isFetchingNextPage) {
                    void fetchNextPage();
                }
            },
            { rootMargin: "200px" }
        );

        observer.observe(node);
        return () => observer.disconnect();
    }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

    const groupTitle =
        group.groupKey === "unlabeled"
            ? t("resourceLauncherUnlabeled")
            : group.name;

    return (
        <Collapsible
            open={isOpen}
            onOpenChange={handleOpenChange}
            className="flex w-full flex-col gap-2.5"
        >
            <LauncherGroupTrigger
                group={group}
                title={groupTitle}
                isOpen={isOpen}
            />

            <CollapsibleContent className="w-full">
                {isLoading ? (
                    <div className="flex items-center justify-center py-10 text-muted-foreground">
                        <Loader2 className="size-5 animate-spin" />
                    </div>
                ) : resources.length === 0 ? (
                    <p className="py-4 text-sm text-muted-foreground">
                        {t("resourceLauncherNoResourcesInGroup")}
                    </p>
                ) : config.layout === "grid" ? (
                    <LauncherResourceGrid
                        resources={resources}
                        showLabels={config.showLabels}
                    />
                ) : (
                    <LauncherResourceList
                        resources={resources}
                        showLabels={config.showLabels}
                        showSiteTags={config.showSiteTags}
                    />
                )}
                <div
                    ref={loadMoreRef}
                    className={cn("h-4", !hasNextPage && "hidden")}
                />
                {isFetchingNextPage ? (
                    <div className="flex justify-center py-2">
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    </div>
                ) : null}
            </CollapsibleContent>
        </Collapsible>
    );
}
