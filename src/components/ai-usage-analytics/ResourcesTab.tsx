"use client";

import { useQuery } from "@tanstack/react-query";
import { aiUsageAnalyticsQueries } from "@app/lib/queries";
import type { AiUsageAnalyticsFilters } from "@app/lib/queries";
import { Card, CardContent, CardHeader } from "@app/components/ui/card";
import { ToggleableTrendChart } from "./ToggleableTrendChart";
import { TopEntitiesList, type TopEntity } from "./TopEntitiesList";
import { buildSeriesFromData, formatCost } from "./shared";

type ResourcesTabProps = {
    orgId: string;
    filters: AiUsageAnalyticsFilters;
};

function resourceTypeLabel(type: "public" | "site" | null) {
    if (type === "public") return "Resource";
    if (type === "site") return "Site resource";
    return undefined;
}

export function ResourcesTab(props: ResourcesTabProps) {
    const { data, isLoading } = useQuery(
        aiUsageAnalyticsQueries.resources({
            orgId: props.orgId,
            filters: props.filters
        })
    );

    const nameByKey = new Map<string, string>();
    for (const r of data?.topResources ?? []) {
        nameByKey.set(r.key, r.name ?? r.key);
    }
    const labelFor = (key: string) =>
        key === "none" ? "No resource" : (nameByKey.get(key) ?? key);

    const costSeries = buildSeriesFromData(
        data?.resourceCostPerDay ?? [],
        labelFor
    );
    const tokensSeries = buildSeriesFromData(
        data?.resourceTokensPerDay ?? [],
        labelFor
    );

    const topResources: TopEntity[] = (data?.topResources ?? []).map((r) => ({
        key: r.key,
        label: r.name ?? (r.key === "none" ? "No resource" : r.key),
        sublabel: resourceTypeLabel(r.type),
        requests: r.requests,
        totalTokens: r.totalTokens,
        costUsd: r.costUsd
    }));

    return (
        <div className="flex flex-col gap-5">
            <Card>
                <CardHeader>
                    <h3 className="font-semibold">Top Resources</h3>
                </CardHeader>
                <CardContent>
                    <TopEntitiesList
                        entities={topResources}
                        isLoading={isLoading}
                        nameColumnLabel="Resource"
                    />
                </CardContent>
            </Card>

            <div className="grid lg:grid-cols-2 gap-5">
                <Card>
                    <CardHeader>
                        <h3 className="font-semibold">Resource Cost</h3>
                    </CardHeader>
                    <CardContent>
                        <ToggleableTrendChart
                            data={data?.resourceCostPerDay ?? []}
                            series={costSeries}
                            isLoading={isLoading}
                            valueFormatter={(v) => formatCost(v)}
                        />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <h3 className="font-semibold">Resource Token Usage</h3>
                    </CardHeader>
                    <CardContent>
                        <ToggleableTrendChart
                            data={data?.resourceTokensPerDay ?? []}
                            series={tokensSeries}
                            isLoading={isLoading}
                        />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
