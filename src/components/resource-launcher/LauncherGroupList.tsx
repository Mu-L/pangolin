"use client";

import type { LauncherActiveViewId } from "@app/lib/launcherLocalStorage";
import { readLauncherGroupOpen } from "@app/lib/launcherLocalStorage";
import { launcherQueries } from "@app/lib/queries";
import type { LauncherViewConfig } from "@server/routers/launcher/types";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LauncherGroupSection } from "./LauncherGroupSection";

type LauncherGroupListProps = {
    orgId: string;
    activeViewId: LauncherActiveViewId;
    config: LauncherViewConfig;
    searchQuery: string;
};

function buildResourceFilters(
    config: LauncherViewConfig,
    searchQuery: string,
    groupKey: string
) {
    return {
        query: searchQuery,
        groupBy: config.groupBy,
        groupKey,
        siteIds: config.siteIds,
        labelIds: config.labelIds,
        sort_by: config.sortBy,
        order: config.order,
        pageSize: 20
    };
}

export function LauncherGroupList({
    orgId,
    activeViewId,
    config,
    searchQuery
}: LauncherGroupListProps) {
    const queryClient = useQueryClient();
    const loadMoreRef = useRef<HTMLDivElement | null>(null);
    const [isPrefetching, setIsPrefetching] = useState(false);
    const prefetchBatchKeyRef = useRef<string | null>(null);

    const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
        useInfiniteQuery({
            ...launcherQueries.groups(orgId, {
                query: searchQuery,
                groupBy: config.groupBy,
                siteIds: config.siteIds,
                labelIds: config.labelIds,
                sort_by: config.sortBy,
                order: config.order,
                pageSize: 20
            })
        });

    const groups = data?.pages.flatMap((page) => page.groups) ?? [];

    const batchKey = useMemo(
        () =>
            JSON.stringify({
                activeViewId,
                searchQuery,
                groupBy: config.groupBy,
                siteIds: config.siteIds,
                labelIds: config.labelIds,
                sortBy: config.sortBy,
                order: config.order
            }),
        [
            activeViewId,
            config.groupBy,
            config.labelIds,
            config.order,
            config.siteIds,
            config.sortBy,
            searchQuery
        ]
    );

    const openGroupKeys = useMemo(
        () =>
            groups
                .filter((group) =>
                    readLauncherGroupOpen(
                        orgId,
                        activeViewId,
                        config.groupBy,
                        group.groupKey,
                        true
                    )
                )
                .map((group) => group.groupKey),
        [activeViewId, config.groupBy, groups, orgId]
    );

    useEffect(() => {
        if (isLoading) {
            return;
        }

        if (openGroupKeys.length === 0) {
            prefetchBatchKeyRef.current = batchKey;
            setIsPrefetching(false);
            return;
        }

        if (prefetchBatchKeyRef.current === batchKey) {
            return;
        }

        let cancelled = false;
        setIsPrefetching(true);

        void Promise.all(
            openGroupKeys.map((groupKey) =>
                queryClient.prefetchInfiniteQuery(
                    launcherQueries.resources(
                        orgId,
                        buildResourceFilters(config, searchQuery, groupKey)
                    )
                )
            )
        ).finally(() => {
            if (!cancelled) {
                prefetchBatchKeyRef.current = batchKey;
                setIsPrefetching(false);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [
        batchKey,
        config,
        isLoading,
        openGroupKeys,
        orgId,
        queryClient,
        searchQuery
    ]);

    const isBatchPending = prefetchBatchKeyRef.current !== batchKey;
    const isBodyLoading =
        isLoading ||
        (isBatchPending &&
            openGroupKeys.length > 0 &&
            (isPrefetching || !isLoading));

    useEffect(() => {
        const node = loadMoreRef.current;
        if (!node || !hasNextPage || isBodyLoading) {
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
    }, [fetchNextPage, hasNextPage, isBodyLoading, isFetchingNextPage]);

    if (isBodyLoading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2.5">
            {groups.map((group) => (
                <LauncherGroupSection
                    key={group.groupKey}
                    orgId={orgId}
                    activeViewId={activeViewId}
                    group={group}
                    config={config}
                    searchQuery={searchQuery}
                />
            ))}
            <div ref={loadMoreRef} className="h-4" />
            {isFetchingNextPage ? (
                <div className="flex justify-center py-2">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
            ) : null}
        </div>
    );
}
