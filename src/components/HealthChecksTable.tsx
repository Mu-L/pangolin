"use client";

import UptimeMiniBar from "@app/components/UptimeMiniBar";

import ConfirmDeleteDialog from "@app/components/ConfirmDeleteDialog";
import HealthCheckCredenza, {
    HealthCheckRow
} from "@app/components/HealthCheckCredenza";
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
import { ArrowUpDown, ArrowUpRight, MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition, useEffect } from "react";
import type { PaginationState } from "@tanstack/react-table";
import type { DataTablePaginationState } from "@app/components/ui/data-table";
import { useNavigationContext } from "@app/hooks/useNavigationContext";
import { useDebouncedCallback } from "use-debounce";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PaidFeaturesAlert } from "@app/components/PaidFeaturesAlert";
import { usePaidStatus } from "@app/hooks/usePaidStatus";
import { tierMatrix } from "@server/lib/billing/tierMatrix";

type StandaloneHealthChecksTableProps = {
    orgId: string;
    healthChecks: HealthCheckRow[];
    rowCount: number;
};

function formatTarget(row: HealthCheckRow): string {
    if (!row.hcHostname) return "-";
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

export default function HealthChecksTable({
    orgId,
    healthChecks,
    rowCount
}: StandaloneHealthChecksTableProps) {
    const router = useRouter();
    const t = useTranslations();
    const api = createApiClient(useEnvContext());
    const [isRefreshing, startRefresh] = useTransition();
    const { isPaidUser } = usePaidStatus();
    const isPaid = isPaidUser(tierMatrix.standaloneHealthChecks);

    const [credenzaOpen, setCredenzaOpen] = useState(false);
    const {
        navigate: filter,
        isNavigating: isFiltering,
        searchParams
    } = useNavigationContext();

    const [deleteOpen, setDeleteOpen] = useState(false);
    const [selected, setSelected] = useState<HealthCheckRow | null>(null);
    const [togglingId, setTogglingId] = useState<number | null>(null);

    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.max(1, Number(searchParams.get("pageSize") ?? 20));
    const pageIndex = page - 1;
    const query = searchParams.get("query") ?? undefined;

    const rows = healthChecks;
    const total = rowCount;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));

    function refreshList() {
        startRefresh(() => {
            router.refresh();
        });
    }

    useEffect(() => {
        const interval = setInterval(() => {
            router.refresh();
        }, 10_000);
        return () => clearInterval(interval);
    }, [router]);

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
            refreshList();
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
            refreshList();
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
                <span>{row.original.name ? row.original.name : "-"}</span>
            )
        },
        {
            id: "mode",
            friendlyName: t("standaloneHcColumnMode"),
            header: () => (
                <span className="p-3">{t("standaloneHcColumnMode")}</span>
            ),
            cell: ({ row }) => (
                <span>
                    {row.original.hcMode?.toUpperCase() ?? "-"}
                </span>
            )
        },
        {
            id: "target",
            friendlyName: t("standaloneHcColumnTarget"),
            header: () => (
                <span className="p-3">{t("standaloneHcColumnTarget")}</span>
            ),
            cell: ({ row }) => <span>{formatTarget(row.original)}</span>
        },
        {
            id: "resource",
            friendlyName: "Resource",
            header: () => (
                <span className="p-3">Resource</span>
            ),
            cell: ({ row }) => {
                const r = row.original;
                if (!r.resourceId || !r.resourceName || !r.resourceNiceId) {
                    return <span className="text-neutral-400">-</span>;
                }
                return (
                    <Link href={`/${orgId}/settings/resources/proxy/${r.resourceNiceId}`}>
                        <Button variant="outline" size="sm">
                            {r.resourceName}
                            <ArrowUpRight className="ml-2 h-3 w-3" />
                        </Button>
                    </Link>
                );
            }
        },
        {
            id: "site",
            friendlyName: "Site",
            header: () => (
                <span className="p-3">Site</span>
            ),
            cell: ({ row }) => {
                const r = row.original;
                if (!r.siteId || !r.siteName || !r.siteNiceId) {
                    return <span className="text-neutral-400">-</span>;
                }
                return (
                    <Link href={`/${orgId}/settings/sites/${r.siteNiceId}/general`}>
                        <Button variant="outline" size="sm">
                            {r.siteName}
                            <ArrowUpRight className="ml-2 h-3 w-3" />
                        </Button>
                    </Link>
                );
            }
        },
        {
            id: "health",
            friendlyName: t("standaloneHcColumnHealth"),
            header: () => (
                <span className="p-3">{t("standaloneHcColumnHealth")}</span>
            ),
            cell: ({ row }) => {
                const health = row.original.hcHealth;
                if (health === "healthy") {
                    return (
                        <span className="text-green-500 flex items-center space-x-2">
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                            <span>{healthLabel.healthy}</span>
                        </span>
                    );
                } else if (health === "unhealthy") {
                    return (
                        <span className="text-red-500 flex items-center space-x-2">
                            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                            <span>{healthLabel.unhealthy}</span>
                        </span>
                    );
                } else {
                    return (
                        <span className="text-neutral-500 flex items-center space-x-2">
                            <div className="w-2 h-2 bg-neutral-500 rounded-full"></div>
                            <span>{healthLabel.unknown}</span>
                        </span>
                    );
                }
            }
        },
        {
            id: "uptime",
            friendlyName: "Uptime",
            header: () => <span className="p-3">{t("uptime30d")}</span>,
            cell: ({ row }) => {
                return (
                    <UptimeMiniBar orgId={orgId} healthCheckId={row.original.targetHealthCheckId} days={30} />
                );
            }
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
                        disabled={
                            !isPaid ||
                            togglingId === r.targetHealthCheckId
                        }
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
                        <Button
                            variant="outline"
                            disabled={!isPaid}
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

            <HealthCheckCredenza
                mode="submit"
                open={credenzaOpen}
                setOpen={(val) => {
                    setCredenzaOpen(val);
                    if (!val) setSelected(null);
                }}
                orgId={orgId}
                initialValues={selected}
                onSaved={refreshList}
            />

            <PaidFeaturesAlert tiers={tierMatrix.standaloneHealthChecks} />

            <DataTable
                columns={columns}
                data={rows}
                title={t("standaloneHcTableTitle")}
                searchPlaceholder={t("standaloneHcSearchPlaceholder")}
                onSearch={handleSearchChange}
                searchQuery={query}
                manualFiltering
                onAdd={() => {
                    setSelected(null);
                    setCredenzaOpen(true);
                }}
                addButtonDisabled={!isPaid}
                onRefresh={refreshList}
                isRefreshing={isRefreshing || isFiltering}
                addButtonText={t("standaloneHcAddButton")}
                enableColumnVisibility
                stickyLeftColumn="name"
                stickyRightColumn="rowActions"
                pagination={paginationState}
                onPaginationChange={handlePaginationChange}
            />
        </>
    );
}
