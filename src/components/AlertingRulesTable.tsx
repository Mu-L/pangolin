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

type AlertingRulesTableProps = {
    orgId: string;
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
        rule.eventType === "site_offline"
    ) {
        return t("alertingSummarySites", { count: rule.siteIds.length });
    }
    return t("alertingSummaryHealthChecks", {
        count: rule.healthCheckIds.length
    });
}

function triggerLabel(
    rule: AlertRuleRow,
    t: (k: string) => string
) {
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
        default:
            return rule.eventType;
    }
}

export default function AlertingRulesTable({ orgId }: AlertingRulesTableProps) {
    const router = useRouter();
    const t = useTranslations();
    const api = createApiClient(useEnvContext());
    const queryClient = useQueryClient();
    const { isPaidUser } = usePaidStatus();
    const isPaid = isPaidUser(tierMatrix.alertingRules);

    const [deleteOpen, setDeleteOpen] = useState(false);
    const [selected, setSelected] = useState<AlertRuleRow | null>(null);
    const [togglingId, setTogglingId] = useState<number | null>(null);

    const {
        data: rows = [],
        isLoading,
        refetch,
        isRefetching
    } = useQuery(orgQueries.alertRules({ orgId }));

    const invalidate = () =>
        queryClient.invalidateQueries(orgQueries.alertRules({ orgId }));

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
            cell: ({ row }) => (
                <span className="font-medium">{row.original.name}</span>
            )
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
            accessorKey: "createdAt",
            friendlyName: t("createdAt"),
            header: () => <span className="p-3">{t("createdAt")}</span>,
            cell: ({ row }) => (
                <span>{moment(row.original.createdAt).format("lll")}</span>
            )
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
                persistPageSize="Org-alerting-rules-table"
                title={t("alertingRules")}
                searchPlaceholder={t("alertingSearchRules")}
                searchColumn="name"
                onAdd={() => {
                    router.push(`/${orgId}/settings/alerting/create`);
                }}
                onRefresh={() => refetch()}
                isRefreshing={isRefetching || isLoading}
                addButtonText={t("alertingAddRule")}
                enableColumnVisibility
                stickyLeftColumn="name"
                stickyRightColumn="rowActions"
            />
        </>
    );
}
