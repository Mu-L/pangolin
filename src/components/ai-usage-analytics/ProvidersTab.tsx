"use client";

import { useQuery } from "@tanstack/react-query";
import { aiUsageAnalyticsQueries } from "@app/lib/queries";
import type { AiUsageAnalyticsFilters } from "@app/lib/queries";
import { Card, CardContent, CardHeader } from "@app/components/ui/card";
import { ToggleableTrendChart } from "./ToggleableTrendChart";
import { TopEntitiesList, type TopEntity } from "./TopEntitiesList";
import { buildSeriesFromData, formatCost } from "./shared";

type ProvidersTabProps = {
    orgId: string;
    filters: AiUsageAnalyticsFilters;
};

export function ProvidersTab(props: ProvidersTabProps) {
    const { data, isLoading } = useQuery(
        aiUsageAnalyticsQueries.providers({
            orgId: props.orgId,
            filters: props.filters
        })
    );

    const nameByKey = new Map<string, string>();
    for (const p of data?.topProviders ?? []) {
        nameByKey.set(String(p.providerId), p.name ?? `Provider #${p.providerId}`);
    }
    const labelFor = (key: string) => nameByKey.get(key) ?? `Provider #${key}`;

    const costSeries = buildSeriesFromData(
        data?.providerCostPerDay ?? [],
        labelFor
    );
    const tokensSeries = buildSeriesFromData(
        data?.providerTokensPerDay ?? [],
        labelFor
    );

    const topProviders: TopEntity[] = (data?.topProviders ?? []).map((p) => ({
        key: String(p.providerId),
        label: p.name ?? `Provider #${p.providerId}`,
        requests: p.requests,
        totalTokens: p.totalTokens,
        costUsd: p.costUsd
    }));

    return (
        <div className="flex flex-col gap-5">
            <Card>
                <CardHeader>
                    <h3 className="font-semibold">Top providers</h3>
                </CardHeader>
                <CardContent>
                    <TopEntitiesList
                        entities={topProviders}
                        isLoading={isLoading}
                        nameColumnLabel="Provider"
                    />
                </CardContent>
            </Card>

            <div className="grid lg:grid-cols-2 gap-5">
                <Card>
                    <CardHeader>
                        <h3 className="font-semibold">Provider cost</h3>
                    </CardHeader>
                    <CardContent>
                        <ToggleableTrendChart
                            data={data?.providerCostPerDay ?? []}
                            series={costSeries}
                            isLoading={isLoading}
                            valueFormatter={(v) => formatCost(v)}
                        />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <h3 className="font-semibold">Provider token usage</h3>
                    </CardHeader>
                    <CardContent>
                        <ToggleableTrendChart
                            data={data?.providerTokensPerDay ?? []}
                            series={tokensSeries}
                            isLoading={isLoading}
                        />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
