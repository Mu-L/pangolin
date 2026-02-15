"use client";

import ConfirmDeleteDialog from "@app/components/ConfirmDeleteDialog";

import { Badge } from "@app/components/ui/badge";
import { Button } from "@app/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@app/components/ui/dropdown-menu";
import { InfoPopup } from "@app/components/ui/info-popup";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useNavigationContext } from "@app/hooks/useNavigationContext";
import { getNextSortOrder, getSortDirection } from "@app/lib/sortColumn";
import { toast } from "@app/hooks/useToast";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { build } from "@server/build";
import { type PaginationState } from "@tanstack/react-table";
import {
    ArrowDown01Icon,
    ArrowRight,
    ArrowUp10Icon,
    ArrowUpRight,
    ChevronsUpDownIcon,
    MoreHorizontal
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useDebouncedCallback } from "use-debounce";
import z from "zod";
import { ColumnFilterButton } from "./ColumnFilterButton";
import {
    ControlledDataTable,
    type ExtendedColumnDef
} from "./ui/controlled-data-table";

export type SiteRow = {
    id: number;
    nice: string;
    name: string;
    mbIn: string;
    mbOut: string;
    orgId: string;
    type: "newt" | "wireguard";
    newtVersion?: string;
    newtUpdateAvailable?: boolean;
    online: boolean;
    address?: string;
    exitNodeName?: string;
    exitNodeEndpoint?: string;
    remoteExitNodeId?: string;
};

type SitesTableProps = {
    sites: SiteRow[];
    pagination: PaginationState;
    orgId: string;
    rowCount: number;
};

export default function SitesTable({
    sites,
    orgId,
    pagination,
    rowCount
}: SitesTableProps) {
    const router = useRouter();
    const pathname = usePathname();
    const {
        navigate: filter,
        isNavigating: isFiltering,
        searchParams
    } = useNavigationContext();

    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [selectedSite, setSelectedSite] = useState<SiteRow | null>(null);
    const [isRefreshing, startTransition] = useTransition();
    const [isNavigatingToAddPage, startNavigation] = useTransition();

    const api = createApiClient(useEnvContext());
    const t = useTranslations();

    const booleanSearchFilterSchema = z
        .enum(["true", "false"])
        .optional()
        .catch(undefined);

    function handleFilterChange(
        column: string,
        value: string | undefined | null
    ) {
        const sp = new URLSearchParams(searchParams);
        sp.delete(column);
        sp.delete("page");

        if (value) {
            sp.set(column, value);
        }
        startTransition(() => router.push(`${pathname}?${sp.toString()}`));
    }

    function refreshData() {
        startTransition(async () => {
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
    }

    function deleteSite(siteId: number) {
        startTransition(async () => {
            await api
                .delete(`/site/${siteId}`)
                .catch((e) => {
                    console.error(t("siteErrorDelete"), e);
                    toast({
                        variant: "destructive",
                        title: t("siteErrorDelete"),
                        description: formatAxiosError(e, t("siteErrorDelete"))
                    });
                })
                .then(() => {
                    router.refresh();
                    setIsDeleteModalOpen(false);
                });
        });
    }

    const columns: ExtendedColumnDef<SiteRow>[] = [
        {
            accessorKey: "name",
            enableHiding: false,
            header: () => {
                return <span className="p-3">{t("name")}</span>;
            }
        },
        {
            id: "niceId",
            accessorKey: "nice",
            friendlyName: t("identifier"),
            enableHiding: true,
            header: () => {
                return <span className="p-3">{t("identifier")}</span>;
            },
            cell: ({ row }) => {
                return <span>{row.original.nice || "-"}</span>;
            }
        },
        {
            accessorKey: "online",
            friendlyName: t("online"),
            header: () => {
                return (
                    <ColumnFilterButton
                        options={[
                            { value: "true", label: t("online") },
                            { value: "false", label: t("offline") }
                        ]}
                        selectedValue={booleanSearchFilterSchema.parse(
                            searchParams.get("online")
                        )}
                        onValueChange={(value) =>
                            handleFilterChange("online", value)
                        }
                        searchPlaceholder={t("searchPlaceholder")}
                        emptyMessage={t("emptySearchOptions")}
                        label={t("online")}
                        className="p-3"
                    />
                );
            },
            cell: ({ row }) => {
                const originalRow = row.original;
                if (
                    originalRow.type == "newt" ||
                    originalRow.type == "wireguard"
                ) {
                    if (originalRow.online) {
                        return (
                            <span className="text-green-500 flex items-center space-x-2">
                                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                <span>{t("online")}</span>
                            </span>
                        );
                    } else {
                        return (
                            <span className="text-neutral-500 flex items-center space-x-2">
                                <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                                <span>{t("offline")}</span>
                            </span>
                        );
                    }
                } else {
                    return <span>-</span>;
                }
            }
        },
        {
            accessorKey: "mbIn",
            friendlyName: t("dataIn"),
            header: () => {
                const dataInOrder = getSortDirection(
                    "megabytesIn",
                    searchParams
                );
                const Icon =
                    dataInOrder === "asc"
                        ? ArrowDown01Icon
                        : dataInOrder === "desc"
                          ? ArrowUp10Icon
                          : ChevronsUpDownIcon;
                return (
                    <Button
                        variant="ghost"
                        onClick={() => toggleSort("megabytesIn")}
                    >
                        {t("dataIn")}
                        <Icon className="ml-2 h-4 w-4" />
                    </Button>
                );
            }
        },
        {
            accessorKey: "mbOut",
            friendlyName: t("dataOut"),
            header: () => {
                const dataOutOrder = getSortDirection(
                    "megabytesOut",
                    searchParams
                );

                const Icon =
                    dataOutOrder === "asc"
                        ? ArrowDown01Icon
                        : dataOutOrder === "desc"
                          ? ArrowUp10Icon
                          : ChevronsUpDownIcon;
                return (
                    <Button
                        variant="ghost"
                        onClick={() => toggleSort("megabytesOut")}
                    >
                        {t("dataOut")}
                        <Icon className="ml-2 h-4 w-4" />
                    </Button>
                );
            }
        },
        {
            accessorKey: "type",
            friendlyName: t("type"),
            header: () => {
                return <span className="p-3">{t("type")}</span>;
            },
            cell: ({ row }) => {
                const originalRow = row.original;

                if (originalRow.type === "newt") {
                    return (
                        <div className="flex items-center space-x-1">
                            <Badge variant="secondary">
                                <div className="flex items-center space-x-1">
                                    <span>Newt</span>
                                    {originalRow.newtVersion && (
                                        <span>v{originalRow.newtVersion}</span>
                                    )}
                                </div>
                            </Badge>
                            {originalRow.newtUpdateAvailable && (
                                <InfoPopup
                                    info={t("newtUpdateAvailableInfo")}
                                />
                            )}
                        </div>
                    );
                }

                if (originalRow.type === "wireguard") {
                    return (
                        <div className="flex items-center space-x-2">
                            <Badge variant="secondary">WireGuard</Badge>
                        </div>
                    );
                }

                if (originalRow.type === "local") {
                    return (
                        <div className="flex items-center space-x-2">
                            <Badge variant="secondary">Local</Badge>
                        </div>
                    );
                }
            }
        },
        {
            accessorKey: "exitNode",
            friendlyName: t("exitNode"),
            header: () => {
                return <span className="p-3">{t("exitNode")}</span>;
            },
            cell: ({ row }) => {
                const originalRow = row.original;
                if (!originalRow.exitNodeName) {
                    return "-";
                }

                const isCloudNode =
                    build == "saas" &&
                    originalRow.exitNodeName &&
                    [
                        "mercury",
                        "venus",
                        "earth",
                        "mars",
                        "jupiter",
                        "saturn",
                        "uranus",
                        "neptune"
                    ].includes(originalRow.exitNodeName.toLowerCase());

                if (isCloudNode) {
                    const capitalizedName =
                        originalRow.exitNodeName.charAt(0).toUpperCase() +
                        originalRow.exitNodeName.slice(1).toLowerCase();
                    return (
                        <Badge variant="secondary">
                            Pangolin {capitalizedName}
                        </Badge>
                    );
                }

                // Self-hosted node
                if (originalRow.remoteExitNodeId) {
                    return (
                        <Link
                            href={`/${originalRow.orgId}/settings/remote-exit-nodes/${originalRow.remoteExitNodeId}`}
                        >
                            <Button variant="outline">
                                {originalRow.exitNodeName}
                                <ArrowUpRight className="ml-2 h-4 w-4" />
                            </Button>
                        </Link>
                    );
                }

                // Fallback if no remoteExitNodeId
                return <span>{originalRow.exitNodeName}</span>;
            }
        },
        {
            accessorKey: "address",
            header: () => {
                return <span className="p-3">{t("address")}</span>;
            },
            cell: ({ row }: { row: any }) => {
                const originalRow = row.original;
                return originalRow.address ? (
                    <div className="flex items-center space-x-2">
                        <span>{originalRow.address}</span>
                    </div>
                ) : (
                    "-"
                );
            }
        },
        {
            id: "actions",
            enableHiding: false,
            header: () => <span className="p-3"></span>,
            cell: ({ row }) => {
                const siteRow = row.original;
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
                                <Link
                                    className="block w-full"
                                    href={`/${siteRow.orgId}/settings/sites/${siteRow.nice}`}
                                >
                                    <DropdownMenuItem>
                                        {t("viewSettings")}
                                    </DropdownMenuItem>
                                </Link>
                                <DropdownMenuItem
                                    onClick={() => {
                                        setSelectedSite(siteRow);
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
                            href={`/${siteRow.orgId}/settings/sites/${siteRow.nice}`}
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

    function toggleSort(column: string) {
        const newSearch = getNextSortOrder(column, searchParams);

        filter({
            searchParams: newSearch
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
            {selectedSite && (
                <ConfirmDeleteDialog
                    open={isDeleteModalOpen}
                    setOpen={(val) => {
                        setIsDeleteModalOpen(val);
                        setSelectedSite(null);
                    }}
                    dialog={
                        <div className="space-y-2">
                            <p>{t("siteQuestionRemove")}</p>
                            <p>{t("siteMessageRemove")}</p>
                        </div>
                    }
                    buttonText={t("siteConfirmDelete")}
                    onConfirm={async () =>
                        startTransition(() => deleteSite(selectedSite!.id))
                    }
                    string={selectedSite.name}
                    title={t("siteDelete")}
                />
            )}

            <ControlledDataTable
                columns={columns}
                rows={sites}
                tableId="sites-table"
                searchPlaceholder={t("searchSitesProgress")}
                pagination={pagination}
                onPaginationChange={handlePaginationChange}
                onAdd={() =>
                    startNavigation(() =>
                        router.push(`/${orgId}/settings/sites/create`)
                    )
                }
                isNavigatingToAddPage={isNavigatingToAddPage}
                searchQuery={searchParams.get("query")?.toString()}
                onSearch={handleSearchChange}
                addButtonText={t("siteAdd")}
                onRefresh={refreshData}
                isRefreshing={isRefreshing || isFiltering}
                rowCount={rowCount}
                columnVisibility={{
                    niceId: false,
                    nice: false,
                    exitNode: false,
                    address: false
                }}
                enableColumnVisibility
                stickyLeftColumn="name"
                stickyRightColumn="actions"
            />
        </>
    );
}
