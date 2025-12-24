"use client";

import ConfirmDeleteDialog from "@app/components/ConfirmDeleteDialog";
import CopyToClipboard from "@app/components/CopyToClipboard";
import { DataTable } from "@app/components/ui/data-table";
import { ExtendedColumnDef } from "@app/components/ui/data-table";
import { Button } from "@app/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@app/components/ui/dropdown-menu";
import { InfoPopup } from "@app/components/ui/info-popup";
import { Switch } from "@app/components/ui/switch";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { toast } from "@app/hooks/useToast";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { UpdateResourceResponse } from "@server/routers/resource";
import { AxiosResponse } from "axios";
import {
    ArrowRight,
    ArrowUpDown,
    CheckCircle2,
    ChevronDown,
    Clock,
    MoreHorizontal,
    ShieldCheck,
    ShieldOff,
    XCircle
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export type TargetHealth = {
    targetId: number;
    ip: string;
    port: number;
    enabled: boolean;
    healthStatus?: "healthy" | "unhealthy" | "unknown";
};

export type ResourceRow = {
    id: number;
    nice: string | null;
    name: string;
    orgId: string;
    domain: string;
    authState: string;
    http: boolean;
    protocol: string;
    proxyPort: number | null;
    enabled: boolean;
    domainId?: string;
    ssl: boolean;
    targetHost?: string;
    targetPort?: number;
    targets?: TargetHealth[];
};

function getOverallHealthStatus(
    targets?: TargetHealth[]
): "online" | "degraded" | "offline" | "unknown" {
    if (!targets || targets.length === 0) {
        return "unknown";
    }

    const monitoredTargets = targets.filter(
        (t) => t.enabled && t.healthStatus && t.healthStatus !== "unknown"
    );

    if (monitoredTargets.length === 0) {
        return "unknown";
    }

    const healthyCount = monitoredTargets.filter(
        (t) => t.healthStatus === "healthy"
    ).length;
    const unhealthyCount = monitoredTargets.filter(
        (t) => t.healthStatus === "unhealthy"
    ).length;

    if (healthyCount === monitoredTargets.length) {
        return "online";
    } else if (unhealthyCount === monitoredTargets.length) {
        return "offline";
    } else {
        return "degraded";
    }
}

function StatusIcon({
    status,
    className = ""
}: {
    status: "online" | "degraded" | "offline" | "unknown";
    className?: string;
}) {
    const iconClass = `h-4 w-4 ${className}`;

    switch (status) {
        case "online":
            return <CheckCircle2 className={`${iconClass} text-green-500`} />;
        case "degraded":
            return <CheckCircle2 className={`${iconClass} text-yellow-500`} />;
        case "offline":
            return <XCircle className={`${iconClass} text-destructive`} />;
        case "unknown":
            return <Clock className={`${iconClass} text-muted-foreground`} />;
        default:
            return null;
    }
}

type ProxyResourcesTableProps = {
    resources: ResourceRow[];
    orgId: string;
    defaultSort?: {
        id: string;
        desc: boolean;
    };
};

export default function ProxyResourcesTable({
    resources,
    orgId,
    defaultSort
}: ProxyResourcesTableProps) {
    const router = useRouter();
    const t = useTranslations();

    const { env } = useEnvContext();

    const api = createApiClient({ env });

    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [selectedResource, setSelectedResource] =
        useState<ResourceRow | null>();

    const [isRefreshing, startTransition] = useTransition();

    const refreshData = () => {
        startTransition(() => {
            try {
                router.refresh();
            } catch (error) {
                toast({
                    title: t("error"),
                    description: t("refreshError"),
                    variant: "destructive"
                });
            }
        });
    };

    const deleteResource = (resourceId: number) => {
        api.delete(`/resource/${resourceId}`)
            .catch((e) => {
                console.error(t("resourceErrorDelte"), e);
                toast({
                    variant: "destructive",
                    title: t("resourceErrorDelte"),
                    description: formatAxiosError(e, t("resourceErrorDelte"))
                });
            })
            .then(() => {
                startTransition(() => {
                    router.refresh();
                    setIsDeleteModalOpen(false);
                });
            });
    };

    async function toggleResourceEnabled(val: boolean, resourceId: number) {
        await api
            .post<AxiosResponse<UpdateResourceResponse>>(
                `resource/${resourceId}`,
                {
                    enabled: val
                }
            )
            .catch((e) => {
                toast({
                    variant: "destructive",
                    title: t("resourcesErrorUpdate"),
                    description: formatAxiosError(
                        e,
                        t("resourcesErrorUpdateDescription")
                    )
                });
            });
    }

    function TargetStatusCell({ targets }: { targets?: TargetHealth[] }) {
        const overallStatus = getOverallHealthStatus(targets);

        if (!targets || targets.length === 0) {
            return (
                <div id="LOOK_FOR_ME" className="flex items-center gap-2">
                    <StatusIcon status="unknown" />
                    <span className="text-sm">
                        {t("resourcesTableNoTargets")}
                    </span>
                </div>
            );
        }

        const monitoredTargets = targets.filter(
            (t) => t.enabled && t.healthStatus && t.healthStatus !== "unknown"
        );
        const unknownTargets = targets.filter(
            (t) => !t.enabled || !t.healthStatus || t.healthStatus === "unknown"
        );

        return (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="flex items-center gap-2 h-8 px-0 font-normal"
                    >
                        <StatusIcon status={overallStatus} />
                        <span className="text-sm">
                            {overallStatus === "online" &&
                                t("resourcesTableHealthy")}
                            {overallStatus === "degraded" &&
                                t("resourcesTableDegraded")}
                            {overallStatus === "offline" &&
                                t("resourcesTableOffline")}
                            {overallStatus === "unknown" &&
                                t("resourcesTableUnknown")}
                        </span>
                        <ChevronDown className="h-3 w-3" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[280px]">
                    {monitoredTargets.length > 0 && (
                        <>
                            {monitoredTargets.map((target) => (
                                <DropdownMenuItem
                                    key={target.targetId}
                                    className="flex items-center justify-between gap-4"
                                >
                                    <div className="flex items-center gap-2">
                                        <StatusIcon
                                            status={
                                                target.healthStatus ===
                                                "healthy"
                                                    ? "online"
                                                    : "offline"
                                            }
                                            className="h-3 w-3"
                                        />
                                        {`${target.ip}:${target.port}`}
                                    </div>
                                    <span
                                        className={`capitalize ${
                                            target.healthStatus === "healthy"
                                                ? "text-green-500"
                                                : "text-destructive"
                                        }`}
                                    >
                                        {target.healthStatus}
                                    </span>
                                </DropdownMenuItem>
                            ))}
                        </>
                    )}
                    {unknownTargets.length > 0 && (
                        <>
                            {unknownTargets.map((target) => (
                                <DropdownMenuItem
                                    key={target.targetId}
                                    className="flex items-center justify-between gap-4"
                                >
                                    <div className="flex items-center gap-2">
                                        <StatusIcon
                                            status="unknown"
                                            className="h-3 w-3"
                                        />
                                        {`${target.ip}:${target.port}`}
                                    </div>
                                    <span className="text-muted-foreground">
                                        {!target.enabled
                                            ? t("disabled")
                                            : t("resourcesTableNotMonitored")}
                                    </span>
                                </DropdownMenuItem>
                            ))}
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        );
    }

    const proxyColumns: ExtendedColumnDef<ResourceRow>[] = [
        {
            accessorKey: "name",
            enableHiding: false,
            friendlyName: t("name"),
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                        onClick={() =>
                            column.toggleSorting(column.getIsSorted() === "asc")
                        }
                    >
                        {t("name")}
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                );
            }
        },
        {
            id: "niceId",
            accessorKey: "nice",
            friendlyName: t("identifier"),
            enableHiding: true,
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                        onClick={() =>
                            column.toggleSorting(column.getIsSorted() === "asc")
                        }
                    >
                        {t("identifier")}
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                );
            },
            cell: ({ row }) => {
                return <span>{row.original.nice || "-"}</span>;
            }
        },
        {
            accessorKey: "protocol",
            friendlyName: t("protocol"),
            header: () => <span className="p-3">{t("protocol")}</span>,
            cell: ({ row }) => {
                const resourceRow = row.original;
                return (
                    <span>
                        {resourceRow.http
                            ? resourceRow.ssl
                                ? "HTTPS"
                                : "HTTP"
                            : resourceRow.protocol.toUpperCase()}
                    </span>
                );
            }
        },
        {
            id: "status",
            accessorKey: "status",
            friendlyName: t("status"),
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                        onClick={() =>
                            column.toggleSorting(column.getIsSorted() === "asc")
                        }
                    >
                        {t("status")}
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                );
            },
            cell: ({ row }) => {
                const resourceRow = row.original;
                return <TargetStatusCell targets={resourceRow.targets} />;
            },
            sortingFn: (rowA, rowB) => {
                const statusA = getOverallHealthStatus(rowA.original.targets);
                const statusB = getOverallHealthStatus(rowB.original.targets);
                const statusOrder = {
                    online: 3,
                    degraded: 2,
                    offline: 1,
                    unknown: 0
                };
                return statusOrder[statusA] - statusOrder[statusB];
            }
        },
        {
            accessorKey: "domain",
            friendlyName: t("access"),
            header: () => <span className="p-3">{t("access")}</span>,
            cell: ({ row }) => {
                const resourceRow = row.original;
                return (
                    <div className="flex items-center space-x-2">
                        {!resourceRow.http ? (
                            <CopyToClipboard
                                text={resourceRow.proxyPort?.toString() || ""}
                                isLink={false}
                            />
                        ) : !resourceRow.domainId ? (
                            <InfoPopup
                                info={t("domainNotFoundDescription")}
                                text={t("domainNotFound")}
                            />
                        ) : (
                            <CopyToClipboard
                                text={resourceRow.domain}
                                isLink={true}
                            />
                        )}
                    </div>
                );
            }
        },
        {
            accessorKey: "authState",
            friendlyName: t("authentication"),
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                        onClick={() =>
                            column.toggleSorting(column.getIsSorted() === "asc")
                        }
                    >
                        {t("authentication")}
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                );
            },
            cell: ({ row }) => {
                const resourceRow = row.original;
                return (
                    <div>
                        {resourceRow.authState === "protected" ? (
                            <span className="flex items-center space-x-2">
                                <ShieldCheck className="w-4 h-4 text-green-500" />
                                <span>{t("protected")}</span>
                            </span>
                        ) : resourceRow.authState === "not_protected" ? (
                            <span className="flex items-center space-x-2">
                                <ShieldOff className="w-4 h-4 text-yellow-500" />
                                <span>{t("notProtected")}</span>
                            </span>
                        ) : (
                            <span>-</span>
                        )}
                    </div>
                );
            }
        },
        {
            accessorKey: "enabled",
            friendlyName: t("enabled"),
            header: () => <span className="p-3">{t("enabled")}</span>,
            cell: ({ row }) => (
                <Switch
                    defaultChecked={
                        row.original.http
                            ? !!row.original.domainId && row.original.enabled
                            : row.original.enabled
                    }
                    disabled={
                        row.original.http ? !row.original.domainId : false
                    }
                    onCheckedChange={(val) =>
                        toggleResourceEnabled(val, row.original.id)
                    }
                />
            )
        },
        {
            id: "actions",
            enableHiding: false,
            header: () => <span className="p-3"></span>,
            cell: ({ row }) => {
                const resourceRow = row.original;
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
                                <Link
                                    className="block w-full"
                                    href={`/${resourceRow.orgId}/settings/resources/proxy/${resourceRow.nice}`}
                                >
                                    <DropdownMenuItem>
                                        {t("viewSettings")}
                                    </DropdownMenuItem>
                                </Link>
                                <DropdownMenuItem
                                    onClick={() => {
                                        setSelectedResource(resourceRow);
                                        setIsDeleteModalOpen(true);
                                    }}
                                >
                                    <span className="text-red-500">
                                        {t("delete")}
                                    </span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Link
                            href={`/${resourceRow.orgId}/settings/resources/proxy/${resourceRow.nice}`}
                        >
                            <Button variant={"outline"}>
                                {t("edit")}
                                <ArrowRight className="ml-2 w-4 h-4" />
                            </Button>
                        </Link>
                    </div>
                );
            }
        }
    ];

    return (
        <>
            {selectedResource && (
                <ConfirmDeleteDialog
                    open={isDeleteModalOpen}
                    setOpen={(val) => {
                        setIsDeleteModalOpen(val);
                        setSelectedResource(null);
                    }}
                    dialog={
                        <div className="space-y-2">
                            <p>{t("resourceQuestionRemove")}</p>
                            <p>{t("resourceMessageRemove")}</p>
                        </div>
                    }
                    buttonText={t("resourceDeleteConfirm")}
                    onConfirm={async () => deleteResource(selectedResource!.id)}
                    string={selectedResource.name}
                    title={t("resourceDelete")}
                />
            )}

            <DataTable
                columns={proxyColumns}
                data={resources}
                persistPageSize="proxy-resources"
                searchPlaceholder={t("resourcesSearch")}
                searchColumn="name"
                onAdd={() =>
                    router.push(`/${orgId}/settings/resources/proxy/create`)
                }
                addButtonText={t("resourceAdd")}
                onRefresh={refreshData}
                isRefreshing={isRefreshing}
                defaultSort={defaultSort}
                enableColumnVisibility={true}
                persistColumnVisibility="proxy-resources"
                columnVisibility={{ niceId: false }}
                stickyLeftColumn="name"
                stickyRightColumn="actions"
            />
        </>
    );
}
