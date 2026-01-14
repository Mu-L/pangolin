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
import { t } from "@faker-js/faker/dist/airline-DF6RqYmq";

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
    approvalState: "approved" | "pending" | "denied";
    archived?: boolean;
    blocked?: boolean;
};

type ClientTableProps = {
    userClients: ClientRow[];
    orgId: string;
};

export default function UserDevicesTable({ userClients }: ClientTableProps) {
    const router = useRouter();
    const t = useTranslations();

    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
    const [selectedClient, setSelectedClient] = useState<ClientRow | null>(
        null
    );

    const { isPaidUser } = usePaidStatus();

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
                    setIsBlockModalOpen(false);
                    setSelectedClient(null);
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
        return userClients.some((client) => !client.userId);
    }, [userClients]);

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
                friendlyName: "User",
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
                            User
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
                                {r.userEmail || r.username || r.userId}
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
                                <span>Connected</span>
                            </span>
                        );
                    } else {
                        return (
                            <span className="text-neutral-500 flex items-center space-x-2">
                                <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                                <span>Disconnected</span>
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

        if (build !== "oss" && isPaidUser) {
            // insert as the 3rd item
            baseColumns.splice(3, 0, {
                id: "approvalState",
                enableHiding: false,
                header: () => <span className="p-3">{t("approvalState")}</span>,
                cell: ({ row }) => {
                    const { approvalState } = row.original;
                    switch (approvalState) {
                        case "approved":
                            return (
                                <Badge variant="green">{t("approved")}</Badge>
                            );
                        case "denied":
                            return <Badge variant="red">{t("denied")}</Badge>;
                        default:
                            return (
                                <Badge variant="secondary">
                                    {t("pending")}
                                </Badge>
                            );
                    }
                }
            });
        }

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
                                            setSelectedClient(clientRow);
                                            setIsBlockModalOpen(true);
                                        }
                                    }}
                                >
                                    <span>
                                        {clientRow.blocked
                                            ? "Unblock"
                                            : "Block"}
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
                                            Delete
                                        </span>
                                    </DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Link
                            href={`/${clientRow.orgId}/settings/clients/${clientRow.id}`}
                        >
                            <Button variant={"outline"}>
                                View
                                <ArrowRight className="ml-2 w-4 h-4" />
                            </Button>
                        </Link>
                    </div>
                );
            }
        });

        return baseColumns;
    }, [hasRowsWithoutUserId, t]);

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
                    buttonText="Confirm Delete Client"
                    onConfirm={async () => deleteClient(selectedClient!.id)}
                    string={selectedClient.name}
                    title="Delete Client"
                />
            )}
            {selectedClient && (
                <ConfirmDeleteDialog
                    open={isBlockModalOpen}
                    setOpen={(val) => {
                        setIsBlockModalOpen(val);
                        if (!val) {
                            setSelectedClient(null);
                        }
                    }}
                    dialog={
                        <div className="space-y-2">
                            <p>{t("blockClientQuestion")}</p>
                            <p>{t("blockClientMessage")}</p>
                        </div>
                    }
                    buttonText={t("blockClientConfirm")}
                    onConfirm={async () => blockClient(selectedClient!.id)}
                    string={selectedClient.name}
                    title={t("blockClient")}
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
