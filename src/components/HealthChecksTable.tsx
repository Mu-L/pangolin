"use client";

import ConfirmDeleteDialog from "@app/components/ConfirmDeleteDialog";
import StandaloneHealthCheckCredenza, {
    HealthCheckRow
} from "@app/components/StandaloneHealthCheckCredenza";
import { Badge } from "@app/components/ui/badge";
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
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { orgQueries } from "@app/lib/queries";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpDown, MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import HealthCheckDialog from "./HealthCheckDialog";

type StandaloneHealthChecksTableProps = {
    orgId: string;
};

function formatTarget(row: HealthCheckRow): string {
    if (!row.hcHostname) return "—";
    if (row.hcMode === "tcp") {
        if (!row.hcPort) return row.hcHostname;
        return `${row.hcHostname}:${row.hcPort}`;
    }
    // HTTP / default
    const scheme = row.hcScheme ?? "http";
    const host = row.hcHostname;
    const port = row.hcPort ? `:${row.hcPort}` : "";
    const path = row.hcPath ?? "/";
    return `${scheme}://${host}${port}${path}`;
}

const healthLabel: Record<HealthCheckRow["hcHealth"], string> = {
    healthy: "Healthy",
    unhealthy: "Unhealthy",
    unknown: "Unknown"
};

const healthVariant: Record<
    HealthCheckRow["hcHealth"],
    "green" | "red" | "secondary"
> = {
    healthy: "green",
    unhealthy: "red",
    unknown: "secondary"
};

function HealthBadge({ health }: { health: HealthCheckRow["hcHealth"] }) {
    return (
        <Badge variant={healthVariant[health]}>{healthLabel[health]}</Badge>
    );
}

export default function HealthChecksTable({
    orgId
}: StandaloneHealthChecksTableProps) {
    const t = useTranslations();
    const api = createApiClient(useEnvContext());
    const queryClient = useQueryClient();

    const [credenzaOpen, setCredenzaOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [selected, setSelected] = useState<HealthCheckRow | null>(null);
    const [togglingId, setTogglingId] = useState<number | null>(null);

    const {
        data: rows = [],
        isLoading,
        refetch,
        isRefetching
    } = useQuery(orgQueries.standaloneHealthChecks({ orgId }));

    const invalidate = () =>
        queryClient.invalidateQueries(
            orgQueries.standaloneHealthChecks({ orgId })
        );

    const handleToggleEnabled = async (
        row: HealthCheckRow,
        enabled: boolean
    ) => {
        setTogglingId(row.targetHealthCheckId);
        try {
            await api.post(
                `/org/${orgId}/health-check/${row.targetHealthCheckId}`,
                { hcEnabled: enabled }
            );
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

    const handleDelete = async () => {
        if (!selected) return;
        try {
            await api.delete(
                `/org/${orgId}/health-check/${selected.targetHealthCheckId}`
            );
            await invalidate();
            toast({ title: t("standaloneHcDeleted") });
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

    const columns: ExtendedColumnDef<HealthCheckRow>[] = [
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
            id: "mode",
            friendlyName: t("standaloneHcColumnMode"),
            header: () => (
                <span className="p-3">{t("standaloneHcColumnMode")}</span>
            ),
            cell: ({ row }) => (
                <span className="uppercase text-xs font-mono">
                    {row.original.hcMode?.toUpperCase() ?? "—"}
                </span>
            )
        },
        {
            id: "target",
            friendlyName: t("standaloneHcColumnTarget"),
            header: () => (
                <span className="p-3">{t("standaloneHcColumnTarget")}</span>
            ),
            cell: ({ row }) => (
                <span className="font-mono text-xs text-muted-foreground truncate max-w-64 block">
                    {formatTarget(row.original)}
                </span>
            )
        },
        {
            id: "health",
            friendlyName: t("standaloneHcColumnHealth"),
            header: () => (
                <span className="p-3">{t("standaloneHcColumnHealth")}</span>
            ),
            cell: ({ row }) => (
                <HealthBadge health={row.original.hcHealth} />
            )
        },
        {
            accessorKey: "hcEnabled",
            friendlyName: t("alertingColumnEnabled"),
            header: () => (
                <span className="p-3">{t("alertingColumnEnabled")}</span>
            ),
            cell: ({ row }) => {
                const r = row.original;
                return (
                    <Switch
                        checked={r.hcEnabled}
                        disabled={togglingId === r.targetHealthCheckId}
                        onCheckedChange={(v) => handleToggleEnabled(r, v)}
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
                        <Button
                            variant="outline"
                            onClick={() => {
                                setSelected(r);
                                setCredenzaOpen(true);
                            }}
                        >
                            {t("edit")}
                        </Button>
                    </div>
                );
            }
        }
    ];

    return (
        <>
            {selected && deleteOpen && (
                <ConfirmDeleteDialog
                    open={deleteOpen}
                    setOpen={(val) => {
                        setDeleteOpen(val);
                        if (!val) setSelected(null);
                    }}
                    dialog={
                        <div className="space-y-2">
                            <p>{t("standaloneHcDeleteQuestion")}</p>
                        </div>
                    }
                    buttonText={t("delete")}
                    onConfirm={handleDelete}
                    string={selected.name}
                    title={t("standaloneHcDeleteTitle")}
                />
            )}

            <StandaloneHealthCheckCredenza
                open={credenzaOpen}
                setOpen={(val) => {
                    setCredenzaOpen(val);
                    if (!val) setSelected(null);
                }}
                orgId={orgId}
                initialValues={selected}
                onSaved={invalidate}
            />

            <DataTable
                columns={columns}
                data={rows}
                persistPageSize="Org-standalone-health-checks-table"
                title={t("standaloneHcTableTitle")}
                searchPlaceholder={t("standaloneHcSearchPlaceholder")}
                searchColumn="name"
                onAdd={() => {
                    setSelected(null);
                    setCredenzaOpen(true);
                }}
                onRefresh={() => refetch()}
                isRefreshing={isRefetching || isLoading}
                addButtonText={t("standaloneHcAddButton")}
                enableColumnVisibility
                stickyLeftColumn="name"
                stickyRightColumn="rowActions"
            />
        </>
    );
}
