"use client";

import ConfirmDeleteDialog from "@app/components/ConfirmDeleteDialog";
import { DataTable } from "@app/components/ui/data-table";
import { ExtendedColumnDef } from "@app/components/ui/data-table";
import { Button } from "@app/components/ui/button";
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
    MoreHorizontal
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Badge } from "./ui/badge";
import { InfoPopup } from "./ui/info-popup";
import ClientDownloadBanner from "./ClientDownloadBanner";

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
            // {
            //     accessorKey: "siteName",
            //     header: ({ column }) => {
            //         return (
            //             <Button
            //                 variant="ghost"
            //                 onClick={() =>
            //                     column.toggleSorting(column.getIsSorted() === "asc")
            //                 }
            //             >
            //                 Site
            //                 <ArrowUpDown className="ml-2 h-4 w-4" />
            //             </Button>
            //         );
            //     },
            //     cell: ({ row }) => {
            //         const r = row.original;
            //         return (
            //             <Link href={`/${r.orgId}/settings/sites/${r.siteId}`}>
            //                 <Button variant="outline">
            //                     {r.siteName}
            //                     <ArrowUpRight className="ml-2 h-4 w-4" />
            //                 </Button>
            //             </Link>
            //         );
            //     }
            // },
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
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                    <span className="sr-only">Open menu</span>
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {/* <Link */}
                                {/*     className="block w-full" */}
                                {/*     href={`/${clientRow.orgId}/settings/sites/${clientRow.nice}`} */}
                                {/* > */}
                                {/*     <DropdownMenuItem> */}
                                {/*         View settings */}
                                {/*     </DropdownMenuItem> */}
                                {/* </Link> */}
                                <DropdownMenuItem
                                    onClick={() => {
                                        setSelectedClient(clientRow);
                                        setIsDeleteModalOpen(true);
                                    }}
                                >
                                    <span className="text-red-500">Delete</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Link
                            href={`/${clientRow.orgId}/settings/clients/${clientRow.id}`}
                        >
                            <Button variant={"outline"}>
                                Edit
                                <ArrowRight className="ml-2 w-4 h-4" />
                            </Button>
                        </Link>
                    </div>
                ) : null;
            }
        });

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
            />
        </>
    );
}
