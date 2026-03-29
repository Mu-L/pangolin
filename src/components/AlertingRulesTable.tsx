"use client";

import AlertRuleCredenza from "@app/components/AlertRuleCredenza";
import ConfirmDeleteDialog from "@app/components/ConfirmDeleteDialog";
import { Button } from "@app/components/ui/button";
import {
    DataTable,
    ExtendedColumnDef
} from "@app/components/ui/data-table";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@app/components/ui/dropdown-menu";
import { Switch } from "@app/components/ui/switch";
import { toast } from "@app/hooks/useToast";
import {
    type AlertRule,
    deleteRule,
    isoNow,
    loadRules,
    upsertRule
} from "@app/lib/alertRulesLocalStorage";
import { ArrowUpDown, MoreHorizontal } from "lucide-react";
import moment from "moment";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@app/components/ui/badge";

type AlertingRulesTableProps = {
    orgId: string;
};

function sourceSummary(rule: AlertRule, t: (k: string, o?: Record<string, number | string>) => string) {
    if (rule.source.type === "site") {
        return t("alertingSummarySites", {
            count: rule.source.siteIds.length
        });
    }
    return t("alertingSummaryHealthChecks", {
        count: rule.source.targetIds.length
    });
}

function triggerLabel(rule: AlertRule, t: (k: string) => string) {
    switch (rule.trigger) {
        case "site_online":
            return t("alertingTriggerSiteOnline");
        case "site_offline":
            return t("alertingTriggerSiteOffline");
        case "health_check_healthy":
            return t("alertingTriggerHcHealthy");
        case "health_check_unhealthy":
            return t("alertingTriggerHcUnhealthy");
        default:
            return rule.trigger;
    }
}

function actionBadges(rule: AlertRule, t: (k: string) => string) {
    return rule.actions.map((a, i) => {
        if (a.type === "notify") {
            return (
                <Badge key={`notify-${i}`} variant="secondary">
                    {t("alertingActionNotify")}
                </Badge>
            );
        }
        if (a.type === "sms") {
            return (
                <Badge key={`sms-${i}`} variant="secondary">
                    {t("alertingActionSms")}
                </Badge>
            );
        }
        return (
            <Badge key={`webhook-${i}`} variant="secondary">
                {t("alertingActionWebhook")}
            </Badge>
        );
    });
}

export default function AlertingRulesTable({ orgId }: AlertingRulesTableProps) {
    const t = useTranslations();
    const [rows, setRows] = useState<AlertRule[]>([]);
    const [credenzaOpen, setCredenzaOpen] = useState(false);
    const [credenzaRule, setCredenzaRule] = useState<AlertRule | null>(null);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [selected, setSelected] = useState<AlertRule | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const refreshFromStorage = useCallback(() => {
        setRows(loadRules(orgId));
    }, [orgId]);

    useEffect(() => {
        refreshFromStorage();
    }, [refreshFromStorage]);

    const refreshData = async () => {
        setIsRefreshing(true);
        try {
            await new Promise((r) => setTimeout(r, 200));
            refreshFromStorage();
        } finally {
            setIsRefreshing(false);
        }
    };

    const setEnabled = (rule: AlertRule, enabled: boolean) => {
        upsertRule(orgId, { ...rule, enabled, updatedAt: isoNow() });
        refreshFromStorage();
    };

    const confirmDelete = async () => {
        if (!selected) return;
        deleteRule(orgId, selected.id);
        refreshFromStorage();
        setDeleteOpen(false);
        setSelected(null);
        toast({ title: t("alertingRuleDeleted") });
    };

    const columns: ExtendedColumnDef<AlertRule>[] = [
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
            header: () => <span className="p-3">{t("alertingColumnSource")}</span>,
            cell: ({ row }) => (
                <span>{sourceSummary(row.original, t)}</span>
            )
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
            id: "actionsCol",
            friendlyName: t("alertingColumnActions"),
            header: () => (
                <span className="p-3">{t("alertingColumnActions")}</span>
            ),
            cell: ({ row }) => (
                <div className="flex flex-wrap gap-1 max-w-[14rem]">
                    {actionBadges(row.original, t)}
                </div>
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
                        onCheckedChange={(v) => setEnabled(r, v)}
                    />
                );
            }
        },
        {
            accessorKey: "createdAt",
            friendlyName: t("createdAt"),
            header: () => (
                <span className="p-3">{t("createdAt")}</span>
            ),
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
                    <div className="flex justify-end">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    className="h-8 w-8 p-0"
                                >
                                    <span className="sr-only">
                                        {t("openMenu")}
                                    </span>
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                    onClick={() => {
                                        setCredenzaRule(r);
                                        setCredenzaOpen(true);
                                    }}
                                >
                                    {t("edit")}
                                </DropdownMenuItem>
                                <DropdownMenuItem
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
                    </div>
                );
            }
        }
    ];

    return (
        <>
            <AlertRuleCredenza
                open={credenzaOpen}
                setOpen={(v) => {
                    setCredenzaOpen(v);
                    if (!v) setCredenzaRule(null);
                }}
                orgId={orgId}
                rule={credenzaRule}
                onSaved={refreshFromStorage}
            />
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
            <DataTable
                columns={columns}
                data={rows}
                persistPageSize="Org-alerting-rules-table"
                title={t("alertingRules")}
                searchPlaceholder={t("alertingSearchRules")}
                searchColumn="name"
                onAdd={() => {
                    setCredenzaRule(null);
                    setCredenzaOpen(true);
                }}
                onRefresh={refreshData}
                isRefreshing={isRefreshing}
                addButtonText={t("alertingAddRule")}
                enableColumnVisibility
                stickyLeftColumn="name"
                stickyRightColumn="rowActions"
            />
        </>
    );
}
