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
import { useEnvContext } from "@app/hooks/useEnvContext";
import { toast } from "@app/hooks/useToast";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { ArrowUpDown, ArrowUpRight, MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import CreateInternalResourceDialog from "@app/components/CreateInternalResourceDialog";
import EditInternalResourceDialog from "@app/components/EditInternalResourceDialog";
import { orgQueries } from "@app/lib/queries";
import { useQuery } from "@tanstack/react-query";
import type { PaginationState } from "@tanstack/react-table";
import { ControlledDataTable } from "./ui/controlled-data-table";
import { useNavigationContext } from "@app/hooks/useNavigationContext";
import { useDebouncedCallback } from "use-debounce";
import { ColumnFilterButton } from "./ColumnFilterButton";

export type InternalResourceRow = {
    id: number;
    name: string;
    orgId: string;
    siteName: string;
    siteAddress: string | null;
    // mode: "host" | "cidr" | "port";
    mode: "host" | "cidr";
    // protocol: string | null;
    // proxyPort: number | null;
    siteId: number;
    siteNiceId: string;
    destination: string;
    // destinationPort: number | null;
    alias: string | null;
    aliasAddress: string | null;
    niceId: string;
    tcpPortRangeString: string | null;
    udpPortRangeString: string | null;
    disableIcmp: boolean;
};

type ClientResourcesTableProps = {
    internalResources: InternalResourceRow[];
    orgId: string;
    pagination: PaginationState;
    rowCount: number;
};

export default function ClientResourcesTable({
    internalResources,
    orgId,
    pagination,
    rowCount
}: ClientResourcesTableProps) {
    const router = useRouter();
    const {
        navigate: filter,
        isNavigating: isFiltering,
        searchParams
    } = useNavigationContext();
    const t = useTranslations();

    const { env } = useEnvContext();

    const api = createApiClient({ env });

    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    const [selectedInternalResource, setSelectedInternalResource] =
        useState<InternalResourceRow | null>();
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [editingResource, setEditingResource] =
        useState<InternalResourceRow | null>();
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

    const { data: sites = [] } = useQuery(orgQueries.sites({ orgId }));

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

    const deleteInternalResource = async (
        resourceId: number,
        siteId: number
    ) => {
        try {
            await api.delete(`/site-resource/${resourceId}`).then(() => {
                startTransition(() => {
                    router.refresh();
                    setIsDeleteModalOpen(false);
                });
            });
        } catch (e) {
            console.error(t("resourceErrorDelete"), e);
            toast({
                variant: "destructive",
                title: t("resourceErrorDelte"),
                description: formatAxiosError(e, t("v"))
            });
        }
    };

    const internalColumns: ExtendedColumnDef<InternalResourceRow>[] = [
        {
            accessorKey: "name",
            enableHiding: false,
            friendlyName: t("name"),
            header: () => <span className="p-3">{t("name")}</span>
        },
        {
            id: "niceId",
            accessorKey: "niceId",
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
                return <span>{row.original.niceId || "-"}</span>;
            }
        },
        {
            accessorKey: "siteName",
            friendlyName: t("site"),
            header: () => <span className="p-3">{t("site")}</span>,
            cell: ({ row }) => {
                const resourceRow = row.original;
                return (
                    <Link
                        href={`/${resourceRow.orgId}/settings/sites/${resourceRow.siteNiceId}`}
                    >
                        <Button variant="outline">
                            {resourceRow.siteName}
                            <ArrowUpRight className="ml-2 h-4 w-4" />
                        </Button>
                    </Link>
                );
            }
        },
        {
            accessorKey: "mode",
            friendlyName: t("editInternalResourceDialogMode"),
            header: () => (
                <ColumnFilterButton
                    options={[
                        {
                            value: "host",
                            label: t("editInternalResourceDialogModeHost")
                        },
                        {
                            value: "cidr",
                            label: t("editInternalResourceDialogModeCidr")
                        }
                    ]}
                    selectedValue={searchParams.get("mode") ?? undefined}
                    onValueChange={(value) => handleFilterChange("mode", value)}
                    searchPlaceholder={t("searchPlaceholder")}
                    emptyMessage={t("emptySearchOptions")}
                    label={t("editInternalResourceDialogMode")}
                    className="p-3"
                />
            ),
            cell: ({ row }) => {
                const resourceRow = row.original;
                const modeLabels: Record<"host" | "cidr" | "port", string> = {
                    host: t("editInternalResourceDialogModeHost"),
                    cidr: t("editInternalResourceDialogModeCidr"),
                    port: t("editInternalResourceDialogModePort")
                };
                return <span>{modeLabels[resourceRow.mode]}</span>;
            }
        },
        {
            accessorKey: "destination",
            friendlyName: t("resourcesTableDestination"),
            header: () => (
                <span className="p-3">{t("resourcesTableDestination")}</span>
            ),
            cell: ({ row }) => {
                const resourceRow = row.original;
                return (
                    <CopyToClipboard
                        text={resourceRow.destination}
                        isLink={false}
                        displayText={resourceRow.destination}
                    />
                );
            }
        },
        {
            accessorKey: "alias",
            friendlyName: t("resourcesTableAlias"),
            header: () => (
                <span className="p-3">{t("resourcesTableAlias")}</span>
            ),
            cell: ({ row }) => {
                const resourceRow = row.original;
                return resourceRow.mode === "host" && resourceRow.alias ? (
                    <CopyToClipboard
                        text={resourceRow.alias}
                        isLink={false}
                        displayText={resourceRow.alias}
                    />
                ) : (
                    <span>-</span>
                );
            }
        },
        {
            accessorKey: "aliasAddress",
            friendlyName: t("resourcesTableAliasAddress"),
            enableHiding: true,
            header: () => (
                <div className="flex items-center gap-2 p-3">
                    <span>{t("resourcesTableAliasAddress")}</span>
                    <InfoPopup info={t("resourcesTableAliasAddressInfo")} />
                </div>
            ),
            cell: ({ row }) => {
                const resourceRow = row.original;
                return resourceRow.aliasAddress ? (
                    <CopyToClipboard
                        text={resourceRow.aliasAddress}
                        isLink={false}
                        displayText={resourceRow.aliasAddress}
                    />
                ) : (
                    <span>-</span>
                );
            }
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
                                <DropdownMenuItem
                                    onClick={() => {
                                        setSelectedInternalResource(
                                            resourceRow
                                        );
                                        setIsDeleteModalOpen(true);
                                    }}
                                >
                                    <span className="text-red-500">
                                        {t("delete")}
                                    </span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                            variant={"outline"}
                            onClick={() => {
                                setEditingResource(resourceRow);
                                setIsEditDialogOpen(true);
                            }}
                        >
                            {t("edit")}
                        </Button>
                    </div>
                );
            }
        }
    ];

    function handleFilterChange(
        column: string,
        value: string | undefined | null
    ) {
        searchParams.delete(column);
        searchParams.delete("page");

        if (value) {
            searchParams.set(column, value);
        }
        filter({
            searchParams
        });
    }

    const handlePaginationChange = (newPage: PaginationState) => {
        searchParams.set("page", (newPage.pageIndex + 1).toString());
        searchParams.set("pageSize", newPage.pageSize.toString());
        filter({
            searchParams
        });
    };

    const handleSearchChange = useDebouncedCallback((query: string) => {
        searchParams.set("query", query);
        searchParams.delete("page");
        filter({
            searchParams
        });
    }, 300);

    return (
        <>
            {selectedInternalResource && (
                <ConfirmDeleteDialog
                    open={isDeleteModalOpen}
                    setOpen={(val) => {
                        setIsDeleteModalOpen(val);
                        setSelectedInternalResource(null);
                    }}
                    dialog={
                        <div className="space-y-2">
                            <p>{t("resourceQuestionRemove")}</p>
                            <p>{t("resourceMessageRemove")}</p>
                        </div>
                    }
                    buttonText={t("resourceDeleteConfirm")}
                    onConfirm={async () =>
                        deleteInternalResource(
                            selectedInternalResource!.id,
                            selectedInternalResource!.siteId
                        )
                    }
                    string={selectedInternalResource.name}
                    title={t("resourceDelete")}
                />
            )}

            <ControlledDataTable
                columns={internalColumns}
                rows={internalResources}
                tableId="internal-resources"
                searchPlaceholder={t("resourcesSearch")}
                onAdd={() => setIsCreateDialogOpen(true)}
                addButtonText={t("resourceAdd")}
                onSearch={handleSearchChange}
                onRefresh={refreshData}
                onPaginationChange={handlePaginationChange}
                pagination={pagination}
                rowCount={rowCount}
                isRefreshing={isRefreshing || isFiltering}
                enableColumnVisibility
                columnVisibility={{
                    niceId: false,
                    aliasAddress: false
                }}
                stickyLeftColumn="name"
                stickyRightColumn="actions"
            />

            {editingResource && (
                <EditInternalResourceDialog
                    open={isEditDialogOpen}
                    setOpen={setIsEditDialogOpen}
                    resource={editingResource}
                    orgId={orgId}
                    sites={sites}
                    onSuccess={() => {
                        // Delay refresh to allow modal to close smoothly
                        setTimeout(() => {
                            router.refresh();
                            setEditingResource(null);
                        }, 150);
                    }}
                />
            )}

            <CreateInternalResourceDialog
                open={isCreateDialogOpen}
                setOpen={setIsCreateDialogOpen}
                orgId={orgId}
                sites={sites}
                onSuccess={() => {
                    // Delay refresh to allow modal to close smoothly
                    setTimeout(() => {
                        router.refresh();
                    }, 150);
                }}
            />
        </>
    );
}
