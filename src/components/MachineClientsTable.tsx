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
import {
    ArrowRight,
    ArrowUpDown,
    MoreHorizontal,
    CircleSlash
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Badge } from "./ui/badge";

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
    archived?: boolean;
    blocked?: boolean;
    approvalState: "approved" | "pending" | "denied";
};

type ClientTableProps = {
    machineClients: ClientRow[];
    orgId: string;
};

export default function MachineClientsTable({
    machineClients,
    orgId
}: ClientTableProps) {
    const router = useRouter();

    const t = useTranslations();

    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [selectedClient, setSelectedClient] = useState<ClientRow | null>(
        null
    );

    const api = createApiClient(useEnvContext());
    const [isRefreshing, startTransition] = useTransition();

    const defaultMachineColumnVisibility = {
        subnet: false,
        userId: false,
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

    // Check if there are any rows without userIds in the current view's data
    const hasRowsWithoutUserId = useMemo(() => {
        return machineClients.some((client) => !client.userId) ?? false;
    }, [machineClients]);

    const columns: ExtendedColumnDef<ClientRow>[] = useMemo(() => {
        const baseColumns: ExtendedColumnDef<ClientRow>[] = [
            {
                accessorKey: "name",
                enableHiding: false,
                friendlyName: "Name",
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
                            Name
                            <ArrowUpDown className="ml-2 h-4 w-4" />
                        </Button>
                    );
                },
                cell: ({ row }) => {
                    const r = row.original;
                    return (
                        <div className="flex items-center gap-2">
                            <span>{r.name}</span>
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
                        </div>
                    );
                }
            },
            {
                accessorKey: "niceId",
                friendlyName: "Identifier",
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
                accessorKey: "online",
                friendlyName: "Connectivity",
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
                            Connectivity
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
                friendlyName: "Data In",
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
                            Data In
                            <ArrowUpDown className="ml-2 h-4 w-4" />
                        </Button>
                    );
                }
            },
            {
                accessorKey: "mbOut",
                friendlyName: "Data Out",
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
                            Data Out
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
                friendlyName: "Address",
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
                            Address
                            <ArrowUpDown className="ml-2 h-4 w-4" />
                        </Button>
                    );
                }
            }
        ];

        // Only include actions column if there are rows without userIds
        if (hasRowsWithoutUserId) {
            baseColumns.push({
                id: "actions",
                enableHiding: false,
                header: () => <span className="p-3"></span>,
                cell: ({ row }) => {
                    const clientRow = row.original;
                    return !clientRow.userId ? (
                        <div className="flex items-center gap-2 justify-end">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        className="h-8 w-8 p-0"
                                    >
                                        <span className="sr-only">
                                            Open menu
                                        </span>
                                        <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
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
                                                ? "Unarchive"
                                                : "Archive"}
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
                                                ? "Unblock"
                                                : "Block"}
                                        </span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => {
                                            setSelectedClient(clientRow);
                                            setIsDeleteModalOpen(true);
                                        }}
                                    >
                                        <span className="text-red-500">
                                            Delete
                                        </span>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <Link
                                href={`/${clientRow.orgId}/settings/clients/machine/${clientRow.niceId}`}
                            >
                                <Button variant={"outline"}>
                                    {t("edit")}
                                    <ArrowRight className="ml-2 w-4 h-4" />
                                </Button>
                            </Link>
                        </div>
                    ) : null;
                }
            });
        }

        return baseColumns;
    }, [hasRowsWithoutUserId, t]);

    return (
        <>
            {selectedClient && (
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
                    buttonText="Confirm Delete Client"
                    onConfirm={async () => deleteClient(selectedClient!.id)}
                    string={selectedClient.name}
                    title="Delete Client"
                />
            )}
            <DataTable
                columns={columns}
                data={machineClients || []}
                persistPageSize="machine-clients"
                searchPlaceholder={t("resourcesSearch")}
                searchColumn="name"
                onAdd={() =>
                    router.push(`/${orgId}/settings/clients/machine/create`)
                }
                addButtonText={t("createClient")}
                onRefresh={refreshData}
                isRefreshing={isRefreshing}
                enableColumnVisibility={true}
                persistColumnVisibility="machine-clients"
                columnVisibility={defaultMachineColumnVisibility}
                stickyLeftColumn="name"
                stickyRightColumn="actions"
                filters={[
                    {
                        id: "status",
                        label: t("status") || "Status",
                        multiSelect: true,
                        displayMode: "calculated",
                        options: [
                            {
                                id: "active",
                                label: t("active") || "Active",
                                value: "active"
                            },
                            {
                                id: "archived",
                                label: t("archived") || "Archived",
                                value: "archived"
                            },
                            {
                                id: "blocked",
                                label: t("blocked") || "Blocked",
                                value: "blocked"
                            }
                        ],
                        filterFn: (
                            row: ClientRow,
                            selectedValues: (string | number | boolean)[]
                        ) => {
                            if (selectedValues.length === 0) return true;
                            const rowArchived = row.archived || false;
                            const rowBlocked = row.blocked || false;
                            const isActive = !rowArchived && !rowBlocked;

                            if (selectedValues.includes("active") && isActive)
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
                        defaultValues: ["active"] // Default to showing active clients
                    }
                ]}
            />
        </>
    );
}
