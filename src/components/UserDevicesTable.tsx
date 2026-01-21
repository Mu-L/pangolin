"use client";

import ConfirmDeleteDialog from "@app/components/ConfirmDeleteDialog";
import { Button } from "@app/components/ui/button";
import { DataTable, ExtendedColumnDef } from "@app/components/ui/data-table";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@app/components/ui/dropdown-menu";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { toast } from "@app/hooks/useToast";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { getUserDisplayName } from "@app/lib/getUserDisplayName";
import { formatFingerprintInfo, formatPlatform } from "@app/lib/formatDeviceFingerprint";
import {
    ArrowRight,
    ArrowUpDown,
    ArrowUpRight,
    MoreHorizontal,
    CircleSlash
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import ClientDownloadBanner from "./ClientDownloadBanner";
import { Badge } from "./ui/badge";
import { build } from "@server/build";
import { usePaidStatus } from "@app/hooks/usePaidStatus";
import { InfoPopup } from "@app/components/ui/info-popup";

export type ClientRow = {
    id: number;
    name: string;
    subnet: string;
    // siteIds: string;
    mbIn: string;
    mbOut: string;
    orgId: string;
    online: boolean;
    olmVersion?: string;
    olmUpdateAvailable: boolean;
    userId: string | null;
    username: string | null;
    userEmail: string | null;
    niceId: string;
    agent: string | null;
    approvalState: "approved" | "pending" | "denied" | null;
    archived?: boolean;
    blocked?: boolean;
    fingerprint?: {
        platform: string | null;
        osVersion: string | null;
        kernelVersion: string | null;
        arch: string | null;
        deviceModel: string | null;
        serialNumber: string | null;
        username: string | null;
        hostname: string | null;
    } | null;
};

type ClientTableProps = {
    userClients: ClientRow[];
    orgId: string;
};

export default function UserDevicesTable({ userClients }: ClientTableProps) {
    const router = useRouter();
    const t = useTranslations();

    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [selectedClient, setSelectedClient] = useState<ClientRow | null>(
        null
    );

    const api = createApiClient(useEnvContext());
    const [isRefreshing, startTransition] = useTransition();

    const defaultUserColumnVisibility = {
        subnet: false,
        niceId: false
    };

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

    const deleteClient = (clientId: number) => {
        api.delete(`/client/${clientId}`)
            .catch((e) => {
                console.error("Error deleting client", e);
                toast({
                    variant: "destructive",
                    title: "Error deleting client",
                    description: formatAxiosError(e, "Error deleting client")
                });
            })
            .then(() => {
                startTransition(() => {
                    router.refresh();
                    setIsDeleteModalOpen(false);
                });
            });
    };

    const archiveClient = (clientId: number) => {
        api.post(`/client/${clientId}/archive`)
            .catch((e) => {
                console.error("Error archiving client", e);
                toast({
                    variant: "destructive",
                    title: "Error archiving client",
                    description: formatAxiosError(e, "Error archiving client")
                });
            })
            .then(() => {
                startTransition(() => {
                    router.refresh();
                });
            });
    };

    const unarchiveClient = (clientId: number) => {
        api.post(`/client/${clientId}/unarchive`)
            .catch((e) => {
                console.error("Error unarchiving client", e);
                toast({
                    variant: "destructive",
                    title: "Error unarchiving client",
                    description: formatAxiosError(e, "Error unarchiving client")
                });
            })
            .then(() => {
                startTransition(() => {
                    router.refresh();
                });
            });
    };

    const blockClient = (clientId: number) => {
        api.post(`/client/${clientId}/block`)
            .catch((e) => {
                console.error("Error blocking client", e);
                toast({
                    variant: "destructive",
                    title: "Error blocking client",
                    description: formatAxiosError(e, "Error blocking client")
                });
            })
            .then(() => {
                startTransition(() => {
                    router.refresh();
                });
            });
    };

    const unblockClient = (clientId: number) => {
        api.post(`/client/${clientId}/unblock`)
            .catch((e) => {
                console.error("Error unblocking client", e);
                toast({
                    variant: "destructive",
                    title: "Error unblocking client",
                    description: formatAxiosError(e, "Error unblocking client")
                });
            })
            .then(() => {
                startTransition(() => {
                    router.refresh();
                });
            });
    };

    const approveDevice = async (clientRow: ClientRow) => {
        try {
            // Fetch approvalId for this client using clientId query parameter
            const approvalsRes = await api.get<{
                data: { approvals: Array<{ approvalId: number; clientId: number }> };
            }>(`/org/${clientRow.orgId}/approvals?approvalState=pending&clientId=${clientRow.id}`);
            
            const approval = approvalsRes.data.data.approvals[0];

            if (!approval) {
                toast({
                    variant: "destructive",
                    title: t("error"),
                    description: t("accessApprovalErrorUpdateDescription")
                });
                return;
            }

            await api.put(`/org/${clientRow.orgId}/approvals/${approval.approvalId}`, {
                decision: "approved"
            });

            toast({
                title: t("accessApprovalUpdated"),
                description: t("accessApprovalApprovedDescription")
            });

            startTransition(() => {
                router.refresh();
            });
        } catch (e) {
            toast({
                variant: "destructive",
                title: t("accessApprovalErrorUpdate"),
                description: formatAxiosError(
                    e,
                    t("accessApprovalErrorUpdateDescription")
                )
            });
        }
    };

    const denyDevice = async (clientRow: ClientRow) => {
        try {
            // Fetch approvalId for this client using clientId query parameter
            const approvalsRes = await api.get<{
                data: { approvals: Array<{ approvalId: number; clientId: number }> };
            }>(`/org/${clientRow.orgId}/approvals?approvalState=pending&clientId=${clientRow.id}`);
            
            const approval = approvalsRes.data.data.approvals[0];

            if (!approval) {
                toast({
                    variant: "destructive",
                    title: t("error"),
                    description: t("accessApprovalErrorUpdateDescription")
                });
                return;
            }

            await api.put(`/org/${clientRow.orgId}/approvals/${approval.approvalId}`, {
                decision: "denied"
            });

            toast({
                title: t("accessApprovalUpdated"),
                description: t("accessApprovalDeniedDescription")
            });

            startTransition(() => {
                router.refresh();
            });
        } catch (e) {
            toast({
                variant: "destructive",
                title: t("accessApprovalErrorUpdate"),
                description: formatAxiosError(
                    e,
                    t("accessApprovalErrorUpdateDescription")
                )
            });
        }
    };

    // Check if there are any rows without userIds in the current view's data
    const hasRowsWithoutUserId = useMemo(() => {
        return userClients.some((client) => !client.userId);
    }, [userClients]);

    const columns: ExtendedColumnDef<ClientRow>[] = useMemo(() => {
        const baseColumns: ExtendedColumnDef<ClientRow>[] = [
            {
                accessorKey: "name",
                enableHiding: false,
                friendlyName: t("name"),
                header: ({ column }) => {
                    return (
                        <Button
                            variant="ghost"
                            onClick={() =>
                                column.toggleSorting(
                                    column.getIsSorted() === "asc"
                                )
                            }
                        >
                            {t("name")}
                            <ArrowUpDown className="ml-2 h-4 w-4" />
                        </Button>
                    );
                },
                cell: ({ row }) => {
                    const r = row.original;
                    const fingerprintInfo = r.fingerprint
                        ? formatFingerprintInfo(r.fingerprint, t)
                        : null;
                    return (
                        <div className="flex items-center gap-2">
                            <span>{r.name}</span>
                            {fingerprintInfo && (
                                <InfoPopup>
                                    <div className="space-y-1 text-sm">
                                        <div className="font-semibold mb-2">
                                            {t("deviceInformation")}
                                        </div>
                                        <div className="text-muted-foreground whitespace-pre-line">
                                            {fingerprintInfo}
                                        </div>
                                    </div>
                                </InfoPopup>
                            )}
                            {r.archived && (
                                <Badge variant="secondary">
                                    {t("archived")}
                                </Badge>
                            )}
                            {r.blocked && (
                                <Badge
                                    variant="destructive"
                                    className="flex items-center gap-1"
                                >
                                    <CircleSlash className="h-3 w-3" />
                                    {t("blocked")}
                                </Badge>
                            )}
                            {r.approvalState === "pending" && (
                                <Badge
                                    variant="outlinePrimary"
                                    className="flex items-center gap-1"
                                >
                                    {t("pendingApproval")}
                                </Badge>
                            )}
                        </div>
                    );
                }
            },
            {
                accessorKey: "niceId",
                friendlyName: t("identifier"),
                header: ({ column }) => {
                    return (
                        <Button
                            variant="ghost"
                            onClick={() =>
                                column.toggleSorting(
                                    column.getIsSorted() === "asc"
                                )
                            }
                        >
                            {t("identifier")}
                            <ArrowUpDown className="ml-2 h-4 w-4" />
                        </Button>
                    );
                }
            },
            {
                accessorKey: "userEmail",
                friendlyName: t("users"),
                header: ({ column }) => {
                    return (
                        <Button
                            variant="ghost"
                            onClick={() =>
                                column.toggleSorting(
                                    column.getIsSorted() === "asc"
                                )
                            }
                        >
                            {t("users")}
                            <ArrowUpDown className="ml-2 h-4 w-4" />
                        </Button>
                    );
                },
                cell: ({ row }) => {
                    const r = row.original;
                    return r.userId ? (
                        <Link
                            href={`/${r.orgId}/settings/access/users/${r.userId}`}
                        >
                            <Button variant="outline">
                                {getUserDisplayName({
                                    email: r.userEmail,
                                    username: r.username
                                }) || r.userId}
                                <ArrowUpRight className="ml-2 h-4 w-4" />
                            </Button>
                        </Link>
                    ) : (
                        "-"
                    );
                }
            },
            {
                accessorKey: "online",
                friendlyName: t("connectivity"),
                header: ({ column }) => {
                    return (
                        <Button
                            variant="ghost"
                            onClick={() =>
                                column.toggleSorting(
                                    column.getIsSorted() === "asc"
                                )
                            }
                        >
                            {t("online")}
                            <ArrowUpDown className="ml-2 h-4 w-4" />
                        </Button>
                    );
                },
                cell: ({ row }) => {
                    const originalRow = row.original;
                    if (originalRow.online) {
                        return (
                            <span className="text-green-500 flex items-center space-x-2">
                                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                <span>{t("connected")}</span>
                            </span>
                        );
                    } else {
                        return (
                            <span className="text-neutral-500 flex items-center space-x-2">
                                <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                                <span>{t("disconnected")}</span>
                            </span>
                        );
                    }
                }
            },
            {
                accessorKey: "mbIn",
                friendlyName: t("dataIn"),
                header: ({ column }) => {
                    return (
                        <Button
                            variant="ghost"
                            onClick={() =>
                                column.toggleSorting(
                                    column.getIsSorted() === "asc"
                                )
                            }
                        >
                            {t("dataIn")}
                            <ArrowUpDown className="ml-2 h-4 w-4" />
                        </Button>
                    );
                }
            },
            {
                accessorKey: "mbOut",
                friendlyName: t("dataOut"),
                header: ({ column }) => {
                    return (
                        <Button
                            variant="ghost"
                            onClick={() =>
                                column.toggleSorting(
                                    column.getIsSorted() === "asc"
                                )
                            }
                        >
                            {t("dataOut")}
                            <ArrowUpDown className="ml-2 h-4 w-4" />
                        </Button>
                    );
                }
            },
            {
                accessorKey: "client",
                friendlyName: t("agent"),
                header: ({ column }) => {
                    return (
                        <Button
                            variant="ghost"
                            onClick={() =>
                                column.toggleSorting(
                                    column.getIsSorted() === "asc"
                                )
                            }
                        >
                            {t("agent")}
                            <ArrowUpDown className="ml-2 h-4 w-4" />
                        </Button>
                    );
                },
                cell: ({ row }) => {
                    const originalRow = row.original;

                    return (
                        <div className="flex items-center space-x-1">
                            {originalRow.agent && originalRow.olmVersion ? (
                                <Badge variant="secondary">
                                    {originalRow.agent +
                                        " v" +
                                        originalRow.olmVersion}
                                </Badge>
                            ) : (
                                "-"
                            )}

                            {/*originalRow.olmUpdateAvailable && (
                                <InfoPopup info={t("olmUpdateAvailableInfo")} />
                            )*/}
                        </div>
                    );
                }
            },
            {
                accessorKey: "subnet",
                friendlyName: t("address"),
                header: ({ column }) => {
                    return (
                        <Button
                            variant="ghost"
                            onClick={() =>
                                column.toggleSorting(
                                    column.getIsSorted() === "asc"
                                )
                            }
                        >
                            {t("address")}
                            <ArrowUpDown className="ml-2 h-4 w-4" />
                        </Button>
                    );
                }
            }
        ];

        baseColumns.push({
            id: "actions",
            enableHiding: false,
            header: () => <span className="p-3"></span>,
            cell: ({ row }) => {
                const clientRow = row.original;
                return (
                    <div className="flex items-center gap-2 justify-end">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                    <span className="sr-only">Open menu</span>
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {clientRow.approvalState === "pending" && build !== "oss" && (
                                    <>
                                        <DropdownMenuItem
                                            onClick={() => approveDevice(clientRow)}
                                        >
                                            <span>{t("approve")}</span>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={() => denyDevice(clientRow)}
                                        >
                                            <span>{t("deny")}</span>
                                        </DropdownMenuItem>
                                    </>
                                )}
                                <DropdownMenuItem
                                    onClick={() => {
                                        if (clientRow.archived) {
                                            unarchiveClient(clientRow.id);
                                        } else {
                                            archiveClient(clientRow.id);
                                        }
                                    }}
                                >
                                    <span>
                                        {clientRow.archived
                                            ? t("actionUnarchiveClient")
                                            : t("actionArchiveClient")}
                                    </span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => {
                                        if (clientRow.blocked) {
                                            unblockClient(clientRow.id);
                                        } else {
                                            blockClient(clientRow.id);
                                        }
                                    }}
                                >
                                    <span>
                                        {clientRow.blocked
                                            ? t("actionUnblockClient")
                                            : t("actionBlockClient")}
                                    </span>
                                </DropdownMenuItem>
                                {!clientRow.userId && (
                                    // Machine client - also show delete option
                                    <DropdownMenuItem
                                        onClick={() => {
                                            setSelectedClient(clientRow);
                                            setIsDeleteModalOpen(true);
                                        }}
                                    >
                                        <span className="text-red-500">
                                            {t("delete")}
                                        </span>
                                    </DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Link
                            href={`/${clientRow.orgId}/settings/clients/user/${clientRow.niceId}`}
                        >
                            <Button variant={"outline"}>
                                {t("viewDetails")}
                                <ArrowRight className="ml-2 w-4 h-4" />
                            </Button>
                        </Link>
                    </div>
                );
            }
        });

        return baseColumns;
    }, [hasRowsWithoutUserId, t]);

    const statusFilterOptions = useMemo(() => {
        const allOptions = [
            {
                id: "active",
                label: t("active"),
                value: "active"
            },
            {
                id: "pending",
                label: t("pendingApproval"),
                value: "pending"
            },
            {
                id: "denied",
                label: t("deniedApproval"),
                value: "denied"
            },
            {
                id: "archived",
                label: t("archived"),
                value: "archived"
            },
            {
                id: "blocked",
                label: t("blocked"),
                value: "blocked"
            }
        ];

        if (build === "oss") {
            return allOptions.filter((option) => option.value !== "pending" && option.value !== "denied");
        }

        return allOptions;
    }, [t]);

    const statusFilterDefaultValues = useMemo(() => {
        if (build === "oss") {
            return ["active"];
        }
        return ["active", "pending"];
    }, []);

    return (
        <>
            {selectedClient && !selectedClient.userId && (
                <ConfirmDeleteDialog
                    open={isDeleteModalOpen}
                    setOpen={(val) => {
                        setIsDeleteModalOpen(val);
                        setSelectedClient(null);
                    }}
                    dialog={
                        <div className="space-y-2">
                            <p>{t("deleteClientQuestion")}</p>
                            <p>{t("clientMessageRemove")}</p>
                        </div>
                    }
                    buttonText={t("actionDeleteClient")}
                    onConfirm={async () => deleteClient(selectedClient!.id)}
                    string={selectedClient.name}
                    title={t("actionDeleteClient")}
                />
            )}
            <ClientDownloadBanner />

            <DataTable
                columns={columns}
                data={userClients || []}
                persistPageSize="user-clients"
                searchPlaceholder={t("resourcesSearch")}
                searchColumn="name"
                onRefresh={refreshData}
                isRefreshing={isRefreshing}
                enableColumnVisibility={true}
                persistColumnVisibility="user-clients"
                columnVisibility={defaultUserColumnVisibility}
                stickyLeftColumn="name"
                stickyRightColumn="actions"
                filters={[
                    {
                        id: "status",
                        label: t("status") || "Status",
                        multiSelect: true,
                        displayMode: "calculated",
                        options: statusFilterOptions,
                        filterFn: (
                            row: ClientRow,
                            selectedValues: (string | number | boolean)[]
                        ) => {
                            if (selectedValues.length === 0) return true;
                            const rowArchived = row.archived;
                            const rowBlocked = row.blocked;
                            const approvalState = row.approvalState;
                            const isActive = !rowArchived && !rowBlocked && approvalState !== "pending" && approvalState !== "denied";

                            if (selectedValues.includes("active") && isActive)
                                return true;
                            if (
                                selectedValues.includes("pending") &&
                                approvalState === "pending"
                            )
                                return true;
                            if (
                                selectedValues.includes("denied") &&
                                approvalState === "denied"
                            )
                                return true;
                            if (
                                selectedValues.includes("archived") &&
                                rowArchived
                            )
                                return true;
                            if (
                                selectedValues.includes("blocked") &&
                                rowBlocked
                            )
                                return true;
                            return false;
                        },
                        defaultValues: statusFilterDefaultValues
                    }
                ]}
            />
        </>
    );
}
