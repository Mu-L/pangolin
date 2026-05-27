"use client";

import ConfirmDeleteDialog from "@app/components/ConfirmDeleteDialog";
import CopyToClipboard from "@app/components/CopyToClipboard";
import { ExtendedColumnDef } from "@app/components/ui/data-table";
import { Badge } from "@app/components/ui/badge";
import { Button } from "@app/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@app/components/ui/dropdown-menu";
import { InfoPopup } from "@app/components/ui/info-popup";
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@app/components/ui/popover";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { toast } from "@app/hooks/useToast";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { getNextSortOrder, getSortDirection } from "@app/lib/sortColumn";
import {
    ArrowDown01Icon,
    ArrowUp10Icon,
    ArrowUpDown,
    ArrowUpRight,
    ChevronDown,
    ChevronsUpDownIcon,
    Funnel,
    MoreHorizontal,
    PlusIcon
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Selectedsite, SitesSelector } from "@app/components/site-selector";
import {
    startTransition,
    useEffect,
    useMemo,
    useOptimistic,
    useState,
    useTransition
} from "react";
import CreateInternalResourceDialog from "@app/components/CreateInternalResourceDialog";
import EditInternalResourceDialog from "@app/components/EditInternalResourceDialog";
import type { PaginationState } from "@tanstack/react-table";
import { ControlledDataTable } from "./ui/controlled-data-table";
import { useNavigationContext } from "@app/hooks/useNavigationContext";
import { useDebouncedCallback } from "use-debounce";
import { ColumnFilterButton } from "./ColumnFilterButton";
import { cn } from "@app/lib/cn";
import { dataTableFilterPopoverContentClassName } from "@app/lib/dataTableFilterPopover";
import { formatSiteResourceDestinationDisplay } from "@app/lib/formatSiteResourceAccess";
import {
    ResourceSitesStatusCell,
    type ResourceSiteRow
} from "@app/components/ResourceSitesStatusCell";
import { ResourceAccessCertIndicator } from "@app/components/ResourceAccessCertIndicator";
import { build } from "@server/build";
import { usePaidStatus } from "@app/hooks/usePaidStatus";
import { tierMatrix } from "@server/lib/billing/tierMatrix";
import { LabelBadge } from "./label-badge";
import { LabelsSelector, type SelectedLabel } from "./labels-selector";

export type InternalResourceSiteRow = ResourceSiteRow;

export type InternalResourceRow = {
    id: number;
    name: string;
    orgId: string;
    sites: InternalResourceSiteRow[];
    siteNames: string[];
    siteAddresses: (string | null)[];
    siteIds: number[];
    siteNiceIds: string[];
    // mode: "host" | "cidr" | "port";
    mode: "host" | "cidr" | "http" | "ssh";
    scheme: "http" | "https" | null;
    ssl: boolean;
    // protocol: string | null;
    // proxyPort: number | null;
    destination: string;
    destinationPort: number | null;
    alias: string | null;
    aliasAddress: string | null;
    niceId: string;
    tcpPortRangeString: string | null;
    udpPortRangeString: string | null;
    disableIcmp: boolean;
    authDaemonMode?: "site" | "remote" | "native" | null;
    authDaemonPort?: number | null;
    pamMode?: "passthrough" | "push" | null;
    subdomain?: string | null;
    domainId?: string | null;
    fullDomain?: string | null;
    labels?: Array<{
        labelId: number;
        name: string;
        color: string;
    }>;
};

function formatDestinationDisplay(row: InternalResourceRow): string {
    return formatSiteResourceDestinationDisplay({
        mode: row.mode,
        destination: row.destination,
        destinationPort: row.destinationPort,
        scheme: row.scheme
    });
}

function isSafeUrlForLink(href: string): boolean {
    try {
        void new URL(href);
        return true;
    } catch {
        return false;
    }
}

type ClientResourcesTableProps = {
    internalResources: InternalResourceRow[];
    orgId: string;
    pagination: PaginationState;
    rowCount: number;
    initialFilterSite?: Selectedsite | null;
};

export default function ClientResourcesTable({
    internalResources,
    orgId,
    pagination,
    rowCount,
    initialFilterSite = null
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
    const [siteFilterOpen, setSiteFilterOpen] = useState(false);

    const [isRefreshing, startRefreshTransition] = useTransition();

    const { isPaidUser } = usePaidStatus();
    const isLabelFeatureEnabled = isPaidUser(tierMatrix.labels);

    useEffect(() => {
        const interval = setInterval(() => {
            router.refresh();
        }, 30_000);
        return () => clearInterval(interval);
    }, [router]);

    const siteIdQ = searchParams.get("siteId");
    const siteIdNum = siteIdQ ? parseInt(siteIdQ, 10) : NaN;
    const selectedSite: Selectedsite | null = useMemo(() => {
        if (!siteIdQ || !Number.isInteger(siteIdNum) || siteIdNum <= 0) {
            return null;
        }
        if (initialFilterSite && initialFilterSite.siteId === siteIdNum) {
            return initialFilterSite;
        }
        return {
            siteId: siteIdNum,
            name: t("standaloneHcFilterSiteIdFallback", { id: siteIdNum }),
            type: "newt"
        };
    }, [initialFilterSite, siteIdQ, siteIdNum, t]);

    const refreshData = () => {
        startRefreshTransition(() => {
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
            startTransition(async () => {
                await api.delete(`/site-resource/${resourceId}`).then(() => {
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

    function SiteCell({ resourceRow }: { resourceRow: InternalResourceRow }) {
        const { siteNames, siteNiceIds, orgId } = resourceRow;

        if (!siteNames || siteNames.length === 0) {
            return (
                <span className="text-muted-foreground">
                    {t("noSites", { defaultValue: "No sites" })}
                </span>
            );
        }

        if (siteNames.length === 1) {
            return (
                <Link href={`/${orgId}/settings/sites/${siteNiceIds[0]}`}>
                    <Button variant="outline">
                        {siteNames[0]}
                        <ArrowUpRight className="ml-2 h-4 w-4" />
                    </Button>
                </Link>
            );
        }

        return (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-2"
                    >
                        <span>
                            {siteNames.length} {t("sites")}
                        </span>
                        <ChevronDown className="h-3 w-3" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                    {siteNames.map((siteName, idx) => (
                        <DropdownMenuItem key={siteNiceIds[idx]} asChild>
                            <Link
                                href={`/${orgId}/settings/sites/${siteNiceIds[idx]}`}
                                className="flex items-center gap-2 cursor-pointer"
                            >
                                {siteName}
                                <ArrowUpRight className="h-3 w-3" />
                            </Link>
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        );
    }

    const internalColumns = useMemo<
        ExtendedColumnDef<InternalResourceRow>[]
    >(() => {
        const cols: ExtendedColumnDef<InternalResourceRow>[] = [
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
                                column.toggleSorting(
                                    column.getIsSorted() === "asc"
                                )
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
                    row.sites.map((s) => s.siteName).join(", "),
                friendlyName: t("sites"),
                header: () => (
                    <Popover
                        open={siteFilterOpen}
                        onOpenChange={setSiteFilterOpen}
                    >
                        <PopoverTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                role="combobox"
                                className={cn(
                                    "justify-between text-sm h-8 px-2 w-full p-3",
                                    !selectedSite && "text-muted-foreground"
                                )}
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    {t("sites")}
                                    <Funnel className="size-4 flex-none" />
                                    {selectedSite && (
                                        <Badge
                                            className="truncate max-w-[10rem]"
                                            variant="secondary"
                                        >
                                            {selectedSite.name}
                                        </Badge>
                                    )}
                                </div>
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent
                            className={dataTableFilterPopoverContentClassName}
                            align="start"
                        >
                            <div className="border-b p-1">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-full justify-start font-normal"
                                    onClick={clearSiteFilter}
                                >
                                    {t("standaloneHcFilterAnySite")}
                                </Button>
                            </div>
                            <SitesSelector
                                orgId={orgId}
                                selectedSite={selectedSite}
                                onSelectSite={onPickSite}
                            />
                        </PopoverContent>
                    </Popover>
                ),
                cell: ({ row }) => {
                    const resourceRow = row.original;
                    return (
                        <ResourceSitesStatusCell
                            orgId={resourceRow.orgId}
                            resourceSites={resourceRow.sites}
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
                            },
                            {
                                value: "ssh",
                                label: t("editInternalResourceDialogModeSsh")
                            }
                        ]}
                        selectedValue={searchParams.get("mode") ?? undefined}
                        onValueChange={(value) =>
                            handleFilterChange("mode", value)
                        }
                        searchPlaceholder={t("searchPlaceholder")}
                        emptyMessage={t("emptySearchOptions")}
                        label={t("editInternalResourceDialogMode")}
                        className="p-3"
                    />
                ),
                cell: ({ row }) => {
                    const resourceRow = row.original;
                    const modeLabels: Record<
                        "host" | "cidr" | "port" | "http" | "ssh",
                        string
                    > = {
                        host: t("editInternalResourceDialogModeHost"),
                        cidr: t("editInternalResourceDialogModeCidr"),
                        port: t("editInternalResourceDialogModePort"),
                        http: t("editInternalResourceDialogModeHttp"),
                        ssh: t("editInternalResourceDialogModeSsh")
                    };
                    return <span>{modeLabels[resourceRow.mode]}</span>;
                }
            },
            {
                accessorKey: "destination",
                friendlyName: t("resourcesTableDestination"),
                header: () => (
                    <span className="p-3">
                        {t("resourcesTableDestination")}
                    </span>
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
                        const domainId = resourceRow.domainId;
                        const fullDomain = resourceRow.fullDomain;
                        const url = `${resourceRow.ssl ? "https" : "http"}://${fullDomain}`;
                        const did =
                            build !== "oss" &&
                            resourceRow.ssl &&
                            domainId != null &&
                            domainId !== "" &&
                            fullDomain != null &&
                            fullDomain !== "";

                        return (
                            <div className="flex items-center gap-2 min-w-0">
                                {did ? (
                                    <ResourceAccessCertIndicator
                                        orgId={resourceRow.orgId}
                                        domainId={domainId}
                                        fullDomain={fullDomain}
                                    />
                                ) : null}
                                <div className="">
                                    <CopyToClipboard
                                        text={url}
                                        isLink={isSafeUrlForLink(url)}
                                        displayText={url}
                                    />
                                </div>
                            </div>
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
                                    <Button
                                        variant="ghost"
                                        className="h-8 w-8 p-0"
                                    >
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

        if (isLabelFeatureEnabled) {
            cols.splice(cols.length - 1, 0, {
                id: "labels",
                accessorKey: "labels",
                header: () => (
                    <span className="p-3 text-end w-full inline-block">
                        {t("labels")}
                    </span>
                ),
                cell: ({ row }: { row: { original: InternalResourceRow } }) => (
                    <ClientResourceLabelCell
                        resource={row.original}
                        orgId={orgId}
                    />
                )
            });
        }

        return cols;
    }, [isLabelFeatureEnabled, orgId, t, searchParams]);

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

    const clearSiteFilter = () => {
        handleFilterChange("siteId", undefined);
        setSiteFilterOpen(false);
    };

    const onPickSite = (site: Selectedsite) => {
        handleFilterChange("siteId", String(site.siteId));
        setSiteFilterOpen(false);
    };

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
                            selectedInternalResource!.siteIds[0]
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
                searchQuery={searchParams.get("query") ?? ""}
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
                    aliasAddress: false,
                    labels: false
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

type ClientResourceLabelCellProps = {
    resource: InternalResourceRow;
    orgId: string;
};

function ClientResourceLabelCell({
    resource,
    orgId
}: ClientResourceLabelCellProps) {
    const t = useTranslations();
    const api = createApiClient(useEnvContext());
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);
    const router = useRouter();

    const labels = resource.labels ?? [];
    const [optimisticLabels, setOptimisticLabels] = useOptimistic(labels);

    function toggleResourceLabel(
        label: SelectedLabel,
        action: "attach" | "detach"
    ) {
        startTransition(async () => {
            try {
                if (action === "attach") {
                    setOptimisticLabels([...optimisticLabels, label]);
                    await api.put(
                        `/org/${orgId}/label/${label.labelId}/attach`,
                        { siteResourceId: resource.id }
                    );
                } else {
                    setOptimisticLabels(
                        optimisticLabels.filter(
                            (lb) => lb.labelId !== label.labelId
                        )
                    );
                    await api.put(
                        `/org/${orgId}/label/${label.labelId}/detach`,
                        { siteResourceId: resource.id }
                    );
                }
            } catch (e) {
                toast({
                    title: t("error"),
                    description: formatAxiosError(e, t("errorOccurred")),
                    variant: "destructive"
                });
            } finally {
                router.refresh();
            }
        });
    }

    return (
        <div className="inline-flex flex-wrap items-center justify-end w-full gap-1">
            {optimisticLabels.slice(0, 3).map((label) => (
                <LabelBadge
                    key={label.labelId}
                    onClick={() => setIsPopoverOpen(true)}
                    {...label}
                />
            ))}
            {optimisticLabels.length > 3 && (
                <Button
                    variant="outline"
                    className={cn(
                        "inline-flex gap-1 items-center",
                        "rounded-full text-sm cursor-pointer",
                        "px-1.5 py-0 h-auto"
                    )}
                    onClick={() => setIsPopoverOpen(true)}
                >
                    +{optimisticLabels.length - 3}
                </Button>
            )}
            <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                <PopoverTrigger asChild>
                    <Button
                        size="icon"
                        variant="outline"
                        className="p-1 size-auto rounded-full"
                        title={t("addLabels")}
                    >
                        <span className="sr-only">{t("addLabels")}</span>
                        <PlusIcon className="size-3" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="center" className="p-0 w-full">
                    <LabelsSelector
                        orgId={orgId}
                        selectedLabels={optimisticLabels}
                        toggleLabel={toggleResourceLabel}
                    />
                </PopoverContent>
            </Popover>
        </div>
    );
}
