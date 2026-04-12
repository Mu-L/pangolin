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
import { getNextSortOrder, getSortDirection } from "@app/lib/sortColumn";
import {
    ArrowDown01Icon,
    ArrowUp10Icon,
    ArrowUpDown,
    ArrowUpRight,
    ChevronsUpDownIcon,
    MoreHorizontal
} from "lucide-react";
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
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@app/components/ui/popover";

export type InternalResourceSiteRow = {
    siteId: number;
    siteName: string;
    siteNiceId: string;
};

export type InternalResourceRow = {
    id: number;
    name: string;
    orgId: string;
    sites: InternalResourceSiteRow[];
    siteName: string;
    siteAddress: string | null;
    // mode: "host" | "cidr" | "port";
    mode: "host" | "cidr" | "http";
    scheme: "http" | "https" | null;
    ssl: boolean;
    // protocol: string | null;
    // proxyPort: number | null;
    siteId: number;
    siteNiceId: string;
    destination: string;
    httpHttpsPort: number | null;
    alias: string | null;
    aliasAddress: string | null;
    niceId: string;
    tcpPortRangeString: string | null;
    udpPortRangeString: string | null;
    disableIcmp: boolean;
    authDaemonMode?: "site" | "remote" | null;
    authDaemonPort?: number | null;
    subdomain?: string | null;
    domainId?: string | null;
    fullDomain?: string | null;
};

function resolveHttpHttpsDisplayPort(
    mode: "http",
    httpHttpsPort: number | null
): number {
    if (httpHttpsPort != null) {
        return httpHttpsPort;
    }
    return 80;
}

function formatDestinationDisplay(row: InternalResourceRow): string {
    const { mode, destination, httpHttpsPort, scheme } = row;
    if (mode !== "http") {
        return destination;
    }
    const port = resolveHttpHttpsDisplayPort(mode, httpHttpsPort);
    const downstreamScheme = scheme ?? "http";
    const hostPart =
        destination.includes(":") && !destination.startsWith("[")
            ? `[${destination}]`
            : destination;
    return `${downstreamScheme}://${hostPart}:${port}`;
}

function isSafeUrlForLink(href: string): boolean {
    try {
        void new URL(href);
        return true;
    } catch {
        return false;
    }
}

const MAX_SITE_LINKS = 3;

function ClientResourceSiteLinks({
    orgId,
    sites
}: {
    orgId: string;
    sites: InternalResourceSiteRow[];
}) {
    if (sites.length === 0) {
        return <span>-</span>;
    }
    const visible = sites.slice(0, MAX_SITE_LINKS);
    const overflow = sites.slice(MAX_SITE_LINKS);

    return (
        <div className="flex flex-wrap items-center gap-1">
            {visible.map((site) => (
                <Link
                    key={site.siteId}
                    href={`/${orgId}/settings/sites/${site.siteNiceId}`}
                >
                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-1"
                    >
                        <span className="max-w-[10rem] truncate">
                            {site.siteName}
                        </span>
                        <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
                    </Button>
                </Link>
            ))}
            {overflow.length > 0 ? (
                <OverflowSitesPopover orgId={orgId} sites={overflow} />
            ) : null}
        </div>
    );
}

function OverflowSitesPopover({
    orgId,
    sites
}: {
    orgId: string;
    sites: InternalResourceSiteRow[];
}) {
    const [open, setOpen] = useState(false);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1 px-2 font-normal"
                    onMouseEnter={() => setOpen(true)}
                    onMouseLeave={() => setOpen(false)}
                >
                    +{sites.length}
                </Button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                side="top"
                className="w-auto max-w-xs p-2"
                onMouseEnter={() => setOpen(true)}
                onMouseLeave={() => setOpen(false)}
            >
                <ul className="flex flex-col gap-1.5 text-sm">
                    {sites.map((site) => (
                        <li key={site.siteId}>
                            <Link
                                href={`/${orgId}/settings/sites/${site.siteNiceId}`}
                            >
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full justify-start gap-1"
                                >
                                    <span className="truncate">
                                        {site.siteName}
                                    </span>
                                    <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0" />
                                </Button>
                            </Link>
                        </li>
                    ))}
                </ul>
            </PopoverContent>
        </Popover>
    );
}

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
            header: () => {
                const nameOrder = getSortDirection("name", searchParams);
                const Icon =
                    nameOrder === "asc"
                        ? ArrowDown01Icon
                        : nameOrder === "desc"
                          ? ArrowUp10Icon
                          : ChevronsUpDownIcon;

                return (
                    <Button
                        variant="ghost"
                        className="p-3"
                        onClick={() => toggleSort("name")}
                    >
                        {t("name")}
                        <Icon className="ml-2 h-4 w-4" />
                    </Button>
                );
            }
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
            id: "sites",
            accessorFn: (row) =>
                row.sites.map((s) => s.siteName).join(", ") || row.siteName,
            friendlyName: t("sites"),
            header: () => <span className="p-3">{t("sites")}</span>,
            cell: ({ row }) => {
                const resourceRow = row.original;
                return (
                    <ClientResourceSiteLinks
                        orgId={resourceRow.orgId}
                        sites={resourceRow.sites}
                    />
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
                        },
                        {
                            value: "http",
                            label: t("editInternalResourceDialogModeHttp")
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
                const modeLabels: Record<
                    "host" | "cidr" | "port" | "http",
                    string
                > = {
                    host: t("editInternalResourceDialogModeHost"),
                    cidr: t("editInternalResourceDialogModeCidr"),
                    port: t("editInternalResourceDialogModePort"),
                    http: t("editInternalResourceDialogModeHttp")
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
                const display = formatDestinationDisplay(resourceRow);
                return (
                    <CopyToClipboard
                        text={display}
                        isLink={false}
                        displayText={display}
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
                if (resourceRow.mode === "host" && resourceRow.alias) {
                    return (
                        <CopyToClipboard
                            text={resourceRow.alias}
                            isLink={false}
                            displayText={resourceRow.alias}
                        />
                    );
                }
                if (resourceRow.mode === "http") {
                    const url = `${resourceRow.ssl ? "https" : "http"}://${resourceRow.fullDomain}`;
                    return (
                        <CopyToClipboard
                            text={url}
                            isLink={isSafeUrlForLink(url)}
                            displayText={url}
                        />
                    );
                }
                return <span>-</span>;
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
