"use client";

import type { LauncherActiveViewId } from "@app/lib/launcherLocalStorage";
import type { LauncherGroupResources } from "@app/lib/launcherServerData";
import { launcherQueries } from "@app/lib/queries";
import type {
    LauncherGroup,
    LauncherViewConfig
} from "@server/routers/launcher/types";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { LauncherGroupSection } from "./LauncherGroupSection";

type LauncherGroupListProps = {
    orgId: string;
    activeViewId: LauncherActiveViewId;
    config: LauncherViewConfig;
    initialGroups: LauncherGroup[];
    groupsPagination: {
        total: number;
        page: number;
        pageSize: number;
    };
    resourcesByGroupKey: Record<string, LauncherGroupResources>;
};

export function LauncherGroupList({
    orgId,
    activeViewId,
    config,
    initialGroups,
    groupsPagination,
    resourcesByGroupKey
}: LauncherGroupListProps) {
    const loadMoreRef = useRef<HTMLDivElement | null>(null);

    const groupFilters = useMemo(
        () => ({
            query: config.query,
            groupBy: config.groupBy,
            siteIds: config.siteIds,
            labelIds: config.labelIds,
            sort_by: config.sortBy,
            order: config.order,
            pageSize: 20
        }),
        [
            config.groupBy,
            config.labelIds,
            config.order,
            config.query,
            config.siteIds,
            config.sortBy
        ]
    );

    const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
        useInfiniteQuery({
            ...launcherQueries.groups(orgId, groupFilters),
            initialData: {
                pages: [
                    {
                        groups: initialGroups,
                        pagination: groupsPagination
                    }
                ],
                pageParams: [1]
            },
            refetchOnMount: false
        });

    const groups = data?.pages.flatMap((page) => page.groups) ?? [];

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

    return (
        <div className="flex flex-col gap-2.5">
            {groups.map((group) => {
                const groupResources = resourcesByGroupKey[group.groupKey];

                return (
                    <LauncherGroupSection
                        key={group.groupKey}
                        orgId={orgId}
                        activeViewId={activeViewId}
                        group={group}
                        config={config}
                        initialResources={groupResources?.resources}
                        initialResourcesPagination={groupResources?.pagination}
                    />
                );
            })}
            <div ref={loadMoreRef} className="h-4" />
            {isFetchingNextPage ? (
                <div className="flex justify-center py-2">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
            ) : null}
        </div>
    );
}
