"use client";

import { useQuery } from "@tanstack/react-query";
import { aiUsageAnalyticsQueries } from "@app/lib/queries";
import type { AiUsageAnalyticsFilters } from "@app/lib/queries";
import { Card, CardContent, CardHeader } from "@app/components/ui/card";
import { ToggleableTrendChart } from "./ToggleableTrendChart";
import { TopEntitiesList, type TopEntity } from "./TopEntitiesList";
import { buildSeriesFromData, formatCost } from "./shared";

type UsersRolesTabProps = {
    orgId: string;
    filters: AiUsageAnalyticsFilters;
};

const UNKNOWN_USER_KEY = "unknown";

export function UsersRolesTab(props: UsersRolesTabProps) {
    const { data, isLoading } = useQuery(
        aiUsageAnalyticsQueries.usersRoles({
            orgId: props.orgId,
            filters: props.filters
        })
    );

    const roleNameByKey = new Map<string, string>();
    for (const r of data?.topRoles ?? []) {
        roleNameByKey.set(String(r.roleId), r.name ?? `Role #${r.roleId}`);
    }
    const roleLabelFor = (key: string) =>
        roleNameByKey.get(key) ?? `Role #${key}`;

    const userEmailByKey = new Map<string, string>();
    for (const u of data?.topUsers ?? []) {
        if (u.userId) {
            userEmailByKey.set(u.userId, u.email ?? u.userId);
        }
    }
    const userLabelFor = (key: string) =>
        key === UNKNOWN_USER_KEY
            ? "Unknown user"
            : (userEmailByKey.get(key) ?? key);

    const roleCostSeries = buildSeriesFromData(
        data?.roleCostPerDay ?? [],
        roleLabelFor
    );
    const roleTokensSeries = buildSeriesFromData(
        data?.roleTokensPerDay ?? [],
        roleLabelFor
    );
    const userCostSeries = buildSeriesFromData(
        data?.userCostPerDay ?? [],
        userLabelFor
    );
    const userTokensSeries = buildSeriesFromData(
        data?.userTokensPerDay ?? [],
        userLabelFor
    );

    const topRoles: TopEntity[] = (data?.topRoles ?? []).map((r) => ({
        key: String(r.roleId),
        label: r.name ?? `Role #${r.roleId}`,
        requests: r.requests,
        totalTokens: r.totalTokens,
        costUsd: r.costUsd
    }));

    const topUsers: TopEntity[] = (data?.topUsers ?? []).map((u) => ({
        key: u.userId ?? UNKNOWN_USER_KEY,
        label: u.email ?? u.userId ?? "Unknown user",
        requests: u.requests,
        totalTokens: u.totalTokens,
        costUsd: u.costUsd
    }));

    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-5">
                <h3 className="font-semibold text-muted-foreground">Roles</h3>
                <Card>
                    <CardHeader>
                        <h3 className="font-semibold">Top roles</h3>
                    </CardHeader>
                    <CardContent>
                        <TopEntitiesList
                            entities={topRoles}
                            isLoading={isLoading}
                            nameColumnLabel="Role"
                        />
                    </CardContent>
                </Card>
                <div className="grid lg:grid-cols-2 gap-5">
                    <Card>
                        <CardHeader>
                            <h3 className="font-semibold">Role cost</h3>
                        </CardHeader>
                        <CardContent>
                            <ToggleableTrendChart
                                data={data?.roleCostPerDay ?? []}
                                series={roleCostSeries}
                                isLoading={isLoading}
                                valueFormatter={(v) => formatCost(v)}
                            />
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <h3 className="font-semibold">Role token usage</h3>
                        </CardHeader>
                        <CardContent>
                            <ToggleableTrendChart
                                data={data?.roleTokensPerDay ?? []}
                                series={roleTokensSeries}
                                isLoading={isLoading}
                            />
                        </CardContent>
                    </Card>
                </div>
            </div>

            <div className="flex flex-col gap-5">
                <h3 className="font-semibold text-muted-foreground">Users</h3>
                <Card>
                    <CardHeader>
                        <h3 className="font-semibold">Top users</h3>
                    </CardHeader>
                    <CardContent>
                        <TopEntitiesList
                            entities={topUsers}
                            isLoading={isLoading}
                            nameColumnLabel="User"
                        />
                    </CardContent>
                </Card>
                <div className="grid lg:grid-cols-2 gap-5">
                    <Card>
                        <CardHeader>
                            <h3 className="font-semibold">User cost</h3>
                        </CardHeader>
                        <CardContent>
                            <ToggleableTrendChart
                                data={data?.userCostPerDay ?? []}
                                series={userCostSeries}
                                isLoading={isLoading}
                                valueFormatter={(v) => formatCost(v)}
                            />
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <h3 className="font-semibold">User token usage</h3>
                        </CardHeader>
                        <CardContent>
                            <ToggleableTrendChart
                                data={data?.userTokensPerDay ?? []}
                                series={userTokensSeries}
                                isLoading={isLoading}
                            />
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
