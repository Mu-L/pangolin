"use client";

import { useQuery } from "@tanstack/react-query";
import { aiUsageAnalyticsQueries } from "@app/lib/queries";
import type { AiUsageAnalyticsFilters } from "@app/lib/queries";
import { Card, CardContent, CardHeader } from "@app/components/ui/card";
import {
    InfoSection,
    InfoSectionContent,
    InfoSections,
    InfoSectionTitle
} from "@app/components/InfoSection";
import { ToggleableTrendChart } from "./ToggleableTrendChart";
import { TopEntitiesList, type TopEntity } from "./TopEntitiesList";
import {
    SERIES_COLORS,
    buildSeriesFromData,
    compactNumberFormatter,
    formatCost
} from "./shared";

type OverviewTabProps = {
    orgId: string;
    filters: AiUsageAnalyticsFilters;
};

const TOKEN_TYPE_LABELS: Record<string, string> = {
    promptTokens: "Prompt",
    cacheReadTokens: "Cache read",
    cacheWriteTokens: "Cache write",
    completionTokens: "Completion",
    reasoningTokens: "Reasoning"
};

export function OverviewTab(props: OverviewTabProps) {
    const { data, isLoading } = useQuery(
        aiUsageAnalyticsQueries.overview({
            orgId: props.orgId,
            filters: props.filters
        })
    );

    const requestsSeries = [
        { key: "requests", label: "Requests", color: SERIES_COLORS[0] }
    ];
    const tokensSeries = Object.keys(TOKEN_TYPE_LABELS).map((key, i) => ({
        key,
        label: TOKEN_TYPE_LABELS[key],
        color: SERIES_COLORS[i % SERIES_COLORS.length]
    }));
    const costSeries = [
        { key: "cost", label: "Cost", color: SERIES_COLORS[0] }
    ];

    const modelCostSeries = buildSeriesFromData(
        data?.modelCostPerDay ?? [],
        (key) => key
    );
    const modelTokensSeries = buildSeriesFromData(
        data?.modelTokensPerDay ?? [],
        (key) => key
    );

    const topModels: TopEntity[] = (data?.topModels ?? []).map((m) => ({
        key: m.model,
        label: m.model,
        requests: m.requests,
        totalTokens: m.totalTokens,
        costUsd: m.costUsd
    }));

    return (
        <div className="flex flex-col gap-5">
            <Card>
                <CardHeader>
                    <InfoSections cols={4}>
                        <InfoSection>
                            <InfoSectionTitle>Total requests</InfoSectionTitle>
                            <InfoSectionContent>
                                {data
                                    ? compactNumberFormatter.format(
                                          data.totalRequests
                                      )
                                    : "--"}
                            </InfoSectionContent>
                        </InfoSection>
                        <InfoSection>
                            <InfoSectionTitle>Total tokens</InfoSectionTitle>
                            <InfoSectionContent>
                                {data
                                    ? compactNumberFormatter.format(
                                          data.totalTokens
                                      )
                                    : "--"}
                            </InfoSectionContent>
                        </InfoSection>
                        <InfoSection>
                            <InfoSectionTitle>Total cost</InfoSectionTitle>
                            <InfoSectionContent>
                                {data ? formatCost(data.totalCost) : "--"}
                            </InfoSectionContent>
                        </InfoSection>
                        <InfoSection>
                            <InfoSectionTitle>Estimated</InfoSectionTitle>
                            <InfoSectionContent>
                                {data
                                    ? `${Math.round(data.estimatedPercent)}%`
                                    : "--"}
                            </InfoSectionContent>
                        </InfoSection>
                    </InfoSections>
                </CardHeader>
            </Card>

            <div className="grid lg:grid-cols-3 gap-5">
                <Card>
                    <CardHeader>
                        <h3 className="font-semibold">Request volume</h3>
                    </CardHeader>
                    <CardContent>
                        <ToggleableTrendChart
                            data={data?.requestsPerDay ?? []}
                            series={requestsSeries}
                            isLoading={isLoading}
                        />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <h3 className="font-semibold">Token usage</h3>
                    </CardHeader>
                    <CardContent>
                        <ToggleableTrendChart
                            data={data?.tokensPerDay ?? []}
                            series={tokensSeries}
                            isLoading={isLoading}
                        />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <h3 className="font-semibold">Cost</h3>
                    </CardHeader>
                    <CardContent>
                        <ToggleableTrendChart
                            data={data?.costPerDay ?? []}
                            series={costSeries}
                            isLoading={isLoading}
                            valueFormatter={(v) => formatCost(v)}
                        />
                    </CardContent>
                </Card>
            </div>

            <div className="grid lg:grid-cols-2 gap-5">
                <Card>
                    <CardHeader>
                        <h3 className="font-semibold">Model cost</h3>
                    </CardHeader>
                    <CardContent>
                        <ToggleableTrendChart
                            data={data?.modelCostPerDay ?? []}
                            series={modelCostSeries}
                            isLoading={isLoading}
                            valueFormatter={(v) => formatCost(v)}
                        />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <h3 className="font-semibold">Model tokens</h3>
                    </CardHeader>
                    <CardContent>
                        <ToggleableTrendChart
                            data={data?.modelTokensPerDay ?? []}
                            series={modelTokensSeries}
                            isLoading={isLoading}
                        />
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <h3 className="font-semibold">Top models</h3>
                </CardHeader>
                <CardContent>
                    <TopEntitiesList
                        entities={topModels}
                        isLoading={isLoading}
                        nameColumnLabel="Model"
                    />
                </CardContent>
            </Card>
        </div>
    );
}
