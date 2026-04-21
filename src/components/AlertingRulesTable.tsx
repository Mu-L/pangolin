"use client";

import ConfirmDeleteDialog from "@app/components/ConfirmDeleteDialog";
import { PaidFeaturesAlert } from "@app/components/PaidFeaturesAlert";
import { Button } from "@app/components/ui/button";
import { DataTable, ExtendedColumnDef } from "@app/components/ui/data-table";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@app/components/ui/dropdown-menu";
import { Switch } from "@app/components/ui/switch";
import { toast } from "@app/hooks/useToast";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useNavigationContext } from "@app/hooks/useNavigationContext";
import { usePaidStatus } from "@app/hooks/usePaidStatus";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { orgQueries } from "@app/lib/queries";
import { tierMatrix } from "@server/lib/billing/tierMatrix";
import { ArrowUpDown, MoreHorizontal } from "lucide-react";
import moment from "moment";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PaginationState } from "@tanstack/react-table";
import type { DataTablePaginationState } from "@app/components/ui/data-table";
import { useDebouncedCallback } from "use-debounce";

type AlertingRulesTableProps = {
    orgId: string;
    siteId?: number;
    resourceId?: number;
};

type AlertRuleRow = {
    alertRuleId: number;
    orgId: string;
    name: string;
    eventType: string;
    enabled: boolean;
    cooldownSeconds: number;
    lastTriggeredAt: number | null;
    createdAt: number;
    updatedAt: number;
    siteIds: number[];
    healthCheckIds: number[];
    resourceIds: number[];
};

function ruleHref(orgId: string, ruleId: number) {
    return `/${orgId}/settings/alerting/${ruleId}`;
}

function sourceSummary(
    rule: AlertRuleRow,
    t: (k: string, o?: Record<string, number | string>) => string
) {
    if (
        rule.eventType === "site_online" ||
        rule.eventType === "site_offline" ||
        rule.eventType === "site_toggle"
    ) {
        return t("alertingSummarySites", { count: rule.siteIds.length });
    }
    if (rule.eventType.startsWith("resource_")) {
        return t("alertingSummaryResources", {
            count: rule.resourceIds.length
        });
    }
    return t("alertingSummaryHealthChecks", {
        count: rule.healthCheckIds.length
    });
}

function triggerLabel(rule: AlertRuleRow, t: (k: string) => string) {
    switch (rule.eventType) {
        case "site_online":
            return t("alertingTriggerSiteOnline");
        case "site_offline":
            return t("alertingTriggerSiteOffline");
        case "site_toggle":
            return t("alertingTriggerSiteToggle");
        case "health_check_healthy":
            return t("alertingTriggerHcHealthy");
        case "health_check_unhealthy":
            return t("alertingTriggerHcUnhealthy");
        case "health_check_toggle":
            return t("alertingTriggerHcToggle");
        case "resource_healthy":
            return t("alertingTriggerResourceHealthy");
        case "resource_unhealthy":
            return t("alertingTriggerResourceUnhealthy");
        case "resource_toggle":
            return t("alertingTriggerResourceToggle");
        default:
            return rule.eventType;
    }
}

export default function AlertingRulesTable({
    orgId,
    siteId,
    resourceId
}: AlertingRulesTableProps) {
    const router = useRouter();
    const t = useTranslations();
    const api = createApiClient(useEnvContext());
    const queryClient = useQueryClient();
    const { isPaidUser } = usePaidStatus();
    const isPaid = isPaidUser(tierMatrix.alertingRules);

    const {
        navigate: filter,
        isNavigating: isFiltering,
        searchParams
    } = useNavigationContext();

    const [deleteOpen, setDeleteOpen] = useState(false);
    const [selected, setSelected] = useState<AlertRuleRow | null>(null);
    const [togglingId, setTogglingId] = useState<number | null>(null);

    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.max(1, Number(searchParams.get("pageSize") ?? 20));
    const pageIndex = page - 1;
    const query = searchParams.get("query") ?? undefined;

    const { data, isLoading, refetch, isRefetching } = useQuery(
        orgQueries.alertRules({
            orgId,
            limit: pageSize,
            offset: pageIndex * pageSize,
            query,
            siteId,
            resourceId
        })
    );

    const rows = data?.alertRules ?? [];
    const total = data?.pagination.total ?? 0;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));

    const paginationState: DataTablePaginationState = {
        pageIndex,
        pageSize,
        pageCount
    };

    const handlePaginationChange = (newState: PaginationState) => {
        searchParams.set("page", (newState.pageIndex + 1).toString());
        searchParams.set("pageSize", newState.pageSize.toString());
        filter({ searchParams });
    };

    const handleSearchChange = useDebouncedCallback((value: string) => {
        if (value) {
            searchParams.set("query", value);
        } else {
            searchParams.delete("query");
        }
        searchParams.delete("page");
        filter({ searchParams });
    }, 300);

    const invalidate = () =>
        queryClient.invalidateQueries({
            queryKey: ["ORG", orgId, "ALERT_RULES"]
        });

    const setEnabled = async (rule: AlertRuleRow, enabled: boolean) => {
        setTogglingId(rule.alertRuleId);
        try {
            await api.post(`/org/${orgId}/alert-rule/${rule.alertRuleId}`, {
                enabled
            });
            await invalidate();
        } catch (e) {
            toast({
                title: t("error"),
                description: formatAxiosError(e),
                variant: "destructive"
            });
        } finally {
            setTogglingId(null);
        }
    };

    const confirmDelete = async () => {
        if (!selected) return;
        try {
            await api.delete(
                `/org/${orgId}/alert-rule/${selected.alertRuleId}`
            );
            await invalidate();
            toast({ title: t("alertingRuleDeleted") });
        } catch (e) {
            toast({
                title: t("error"),
                description: formatAxiosError(e),
                variant: "destructive"
            });
        } finally {
            setDeleteOpen(false);
            setSelected(null);
        }
    };

    const columns: ExtendedColumnDef<AlertRuleRow>[] = [
        {
            accessorKey: "name",
            enableHiding: false,
            friendlyName: t("name"),
            header: ({ column }) => (
                <Button
                    variant="ghost"
                    onClick={() =>
                        column.toggleSorting(column.getIsSorted() === "asc")
                    }
                >
                    {t("name")}
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            ),
            cell: ({ row }) => <span>{row.original.name}</span>
        },
        {
            id: "source",
            friendlyName: t("alertingColumnSource"),
            header: () => (
                <span className="p-3">{t("alertingColumnSource")}</span>
            ),
            cell: ({ row }) => <span>{sourceSummary(row.original, t)}</span>
        },
        {
            id: "trigger",
            friendlyName: t("alertingColumnTrigger"),
            header: () => (
                <span className="p-3">{t("alertingColumnTrigger")}</span>
            ),
            cell: ({ row }) => <span>{triggerLabel(row.original, t)}</span>
        },
        {
            accessorKey: "lastTriggeredAt",
            friendlyName: t("lastTriggeredAt"),
            header: () => <span className="p-3">{t("lastTriggeredAt")}</span>,
            cell: ({ row }) => (
                <span>
                    {row.original.lastTriggeredAt
                        ? moment(row.original.lastTriggeredAt).format("lll")
                        : "-"}
                </span>
            )
        },
        {
            accessorKey: "enabled",
            friendlyName: t("alertingColumnEnabled"),
            header: () => (
                <span className="p-3">{t("alertingColumnEnabled")}</span>
            ),
            cell: ({ row }) => {
                const r = row.original;
                return (
                    <Switch
                        checked={r.enabled}
                        disabled={!isPaid || togglingId === r.alertRuleId}
                        onCheckedChange={(v) => setEnabled(r, v)}
                    />
                );
            }
        },
        {
            id: "rowActions",
            enableHiding: false,
            header: () => <span className="p-3" />,
            cell: ({ row }) => {
                const r = row.original;
                return (
                    <div className="flex items-center gap-2 justify-end">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                    <span className="sr-only">
                                        {t("openMenu")}
                                    </span>
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                    disabled={!isPaid}
                                    onClick={() => {
                                        setSelected(r);
                                        setDeleteOpen(true);
                                    }}
                                >
                                    <span className="text-red-500">
                                        {t("delete")}
                                    </span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button variant="outline" asChild>
                            <Link href={ruleHref(orgId, r.alertRuleId)}>
                                {t("edit")}
                            </Link>
                        </Button>
                    </div>
                );
            }
        }
    ];

    return (
        <>
            {selected && (
                <ConfirmDeleteDialog
                    open={deleteOpen}
                    setOpen={(val) => {
                        setDeleteOpen(val);
                        if (!val) setSelected(null);
                    }}
                    dialog={
                        <div className="space-y-2">
                            <p>{t("alertingDeleteQuestion")}</p>
                        </div>
                    }
                    buttonText={t("delete")}
                    onConfirm={confirmDelete}
                    string={selected.name}
                    title={t("alertingDeleteRule")}
                />
            )}
            <PaidFeaturesAlert tiers={tierMatrix.alertingRules} />

            <DataTable
                columns={columns}
                data={rows}
                title={t("alertingRules")}
                searchPlaceholder={t("alertingSearchRules")}
                onSearch={handleSearchChange}
                searchQuery={query}
                manualFiltering
                onAdd={() => {
                    router.push(`/${orgId}/settings/alerting/create`);
                }}
                onRefresh={() => refetch()}
                isRefreshing={isRefetching || isLoading || isFiltering}
                addButtonText={t("alertingAddRule")}
                enableColumnVisibility
                stickyLeftColumn="name"
                stickyRightColumn="rowActions"
                pagination={paginationState}
                onPaginationChange={handlePaginationChange}
            />
        </>
    );
}
