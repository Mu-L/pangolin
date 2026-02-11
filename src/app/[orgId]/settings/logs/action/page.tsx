"use client";
import { ColumnFilter } from "@app/components/ColumnFilter";
import { DateTimeValue } from "@app/components/DateTimePicker";
import { LogDataTable } from "@app/components/LogDataTable";
import { PaidFeaturesAlert } from "@app/components/PaidFeaturesAlert";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { usePaidStatus } from "@app/hooks/usePaidStatus";
import { useStoredPageSize } from "@app/hooks/useStoredPageSize";
import { toast } from "@app/hooks/useToast";
import { createApiClient } from "@app/lib/api";
import { getSevenDaysAgo } from "@app/lib/getSevenDaysAgo";
import { build } from "@server/build";
import { tierMatrix } from "@server/lib/billing/tierMatrix";
import { ColumnDef } from "@tanstack/react-table";
import axios from "axios";
import { Key, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

export default function GeneralPage() {
    const router = useRouter();
    const api = createApiClient(useEnvContext());
    const t = useTranslations();
    const { orgId } = useParams();
    const searchParams = useSearchParams();

    const { isPaidUser } = usePaidStatus();

    const [rows, setRows] = useState<any[]>([]);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isExporting, startTransition] = useTransition();
    const [filterAttributes, setFilterAttributes] = useState<{
        actors: string[];
        actions: string[];
    }>({
        actors: [],
        actions: []
    });

    // Filter states - unified object for all filters
    const [filters, setFilters] = useState<{
        action?: string;
        actor?: string;
    }>({
        action: searchParams.get("action") || undefined,
        actor: searchParams.get("actor") || undefined
    });

    // Pagination state
    const [totalCount, setTotalCount] = useState<number>(0);
    const [currentPage, setCurrentPage] = useState<number>(0);
    const [isLoading, setIsLoading] = useState(false);

    // Initialize page size from storage or default
    const [pageSize, setPageSize] = useStoredPageSize("action-audit-logs", 20);

    // Set default date range to last 24 hours
    const getDefaultDateRange = () => {
        // if the time is in the url params, use that instead
        const startParam = searchParams.get("start");
        const endParam = searchParams.get("end");
        if (startParam && endParam) {
            return {
                startDate: {
                    date: new Date(startParam)
                },
                endDate: {
                    date: new Date(endParam)
                }
            };
        }

        const now = new Date();
        const lastWeek = getSevenDaysAgo();

        return {
            startDate: {
                date: lastWeek
            },
            endDate: {
                date: now
            }
        };
    };

    const [dateRange, setDateRange] = useState<{
        startDate: DateTimeValue;
        endDate: DateTimeValue;
    }>(getDefaultDateRange());

    // Trigger search with default values on component mount
    useEffect(() => {
        if (build === "oss") {
            return;
        }
        const defaultRange = getDefaultDateRange();
        queryDateTime(
            defaultRange.startDate,
            defaultRange.endDate,
            0,
            pageSize
        );
    }, [orgId]); // Re-run if orgId changes

    const handleDateRangeChange = (
        startDate: DateTimeValue,
        endDate: DateTimeValue
    ) => {
        setDateRange({ startDate, endDate });
        setCurrentPage(0); // Reset to first page when filtering
        // put the search params in the url for the time
        updateUrlParamsForAllFilters({
            start: startDate.date?.toISOString() || "",
            end: endDate.date?.toISOString() || ""
        });

        queryDateTime(startDate, endDate, 0, pageSize);
    };

    // Handle page changes
    const handlePageChange = (newPage: number) => {
        setCurrentPage(newPage);
        queryDateTime(
            dateRange.startDate,
            dateRange.endDate,
            newPage,
            pageSize
        );
    };

    // Handle page size changes
    const handlePageSizeChange = (newPageSize: number) => {
        setPageSize(newPageSize);
        setCurrentPage(0); // Reset to first page when changing page size
        queryDateTime(dateRange.startDate, dateRange.endDate, 0, newPageSize);
    };

    // Handle filter changes generically
    const handleFilterChange = (
        filterType: keyof typeof filters,
        value: string | undefined
    ) => {
        // Create new filters object with updated value
        const newFilters = {
            ...filters,
            [filterType]: value
        };

        setFilters(newFilters);
        setCurrentPage(0); // Reset to first page when filtering

        // Update URL params
        updateUrlParamsForAllFilters(newFilters);

        // Trigger new query with updated filters (pass directly to avoid async state issues)
        queryDateTime(
            dateRange.startDate,
            dateRange.endDate,
            0,
            pageSize,
            newFilters
        );
    };

    const updateUrlParamsForAllFilters = (
        newFilters:
            | typeof filters
            | {
                  start: string;
                  end: string;
              }
    ) => {
        const params = new URLSearchParams(searchParams);
        Object.entries(newFilters).forEach(([key, value]) => {
            if (value) {
                params.set(key, value);
            } else {
                params.delete(key);
            }
        });
        router.replace(`?${params.toString()}`, { scroll: false });
    };

    const queryDateTime = async (
        startDate: DateTimeValue,
        endDate: DateTimeValue,
        page: number = currentPage,
        size: number = pageSize,
        filtersParam?: {
            action?: string;
            actor?: string;
        }
    ) => {
        console.log("Date range changed:", { startDate, endDate, page, size });
        if (!isPaidUser(tierMatrix.actionLogs)) {
            console.log(
                "Access denied: subscription inactive or license locked"
            );
            return;
        }
        setIsLoading(true);

        try {
            // Use the provided filters or fall back to current state
            const activeFilters = filtersParam || filters;

            // Convert the date/time values to API parameters
            const params: any = {
                limit: size,
                offset: page * size,
                ...activeFilters
            };

            if (startDate?.date) {
                const startDateTime = new Date(startDate.date);
                if (startDate.time) {
                    const [hours, minutes, seconds] = startDate.time
                        .split(":")
                        .map(Number);
                    startDateTime.setHours(hours, minutes, seconds || 0);
                }
                params.timeStart = startDateTime.toISOString();
            }

            if (endDate?.date) {
                const endDateTime = new Date(endDate.date);
                if (endDate.time) {
                    const [hours, minutes, seconds] = endDate.time
                        .split(":")
                        .map(Number);
                    endDateTime.setHours(hours, minutes, seconds || 0);
                } else {
                    // If no time is specified, set to NOW
                    const now = new Date();
                    endDateTime.setHours(
                        now.getHours(),
                        now.getMinutes(),
                        now.getSeconds(),
                        now.getMilliseconds()
                    );
                }
                params.timeEnd = endDateTime.toISOString();
            }

            const res = await api.get(`/org/${orgId}/logs/action`, { params });
            if (res.status === 200) {
                setRows(res.data.data.log || []);
                setTotalCount(res.data.data.pagination?.total || 0);
                setFilterAttributes(res.data.data.filterAttributes);
                console.log("Fetched logs:", res.data);
            }
        } catch (error) {
            toast({
                title: t("error"),
                description: t("Failed to filter logs"),
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    };

    const refreshData = async () => {
        console.log("Data refreshed");
        setIsRefreshing(true);
        try {
            // Refresh data with current date range and pagination
            await queryDateTime(
                dateRange.startDate,
                dateRange.endDate,
                currentPage,
                pageSize
            );
        } catch (error) {
            toast({
                title: t("error"),
                description: t("refreshError"),
                variant: "destructive"
            });
        } finally {
            setIsRefreshing(false);
        }
    };

    const exportData = async () => {
        try {
            // Prepare query params for export
            const params: any = {
                timeStart: dateRange.startDate?.date
                    ? new Date(dateRange.startDate.date).toISOString()
                    : undefined,
                timeEnd: dateRange.endDate?.date
                    ? new Date(dateRange.endDate.date).toISOString()
                    : undefined,
                ...filters
            };

            const response = await api.get(`/org/${orgId}/logs/action/export`, {
                responseType: "blob",
                params
            });

            // Create a URL for the blob and trigger a download
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement("a");
            link.href = url;
            const epoch = Math.floor(Date.now() / 1000);
            link.setAttribute(
                "download",
                `action-audit-logs-${orgId}-${epoch}.csv`
            );
            document.body.appendChild(link);
            link.click();
            link.parentNode?.removeChild(link);
        } catch (error) {
            let apiErrorMessage: string | null = null;
            if (axios.isAxiosError(error) && error.response) {
                const data = error.response.data;

                if (data instanceof Blob && data.type === "application/json") {
                    // Parse the Blob as JSON
                    const text = await data.text();
                    const errorData = JSON.parse(text);
                    apiErrorMessage = errorData.message;
                }
            }
            toast({
                title: t("error"),
                description: apiErrorMessage ?? t("exportError"),
                variant: "destructive"
            });
        }
    };

    const columns: ColumnDef<any>[] = [
        {
            accessorKey: "timestamp",
            header: ({ column }) => {
                return t("timestamp");
            },
            cell: ({ row }) => {
                return (
                    <div className="whitespace-nowrap">
                        {new Date(
                            row.original.timestamp * 1000
                        ).toLocaleString()}
                    </div>
                );
            }
        },
        {
            accessorKey: "action",
            header: ({ column }) => {
                return (
                    <div className="flex items-center gap-2">
                        <span>{t("action")}</span>
                        <ColumnFilter
                            options={filterAttributes.actions.map((action) => ({
                                label:
                                    action.charAt(0).toUpperCase() +
                                    action.slice(1),
                                value: action
                            }))}
                            selectedValue={filters.action}
                            onValueChange={(value) =>
                                handleFilterChange("action", value)
                            }
                            // placeholder=""
                            searchPlaceholder="Search..."
                            emptyMessage="None found"
                        />
                    </div>
                );
            },
            cell: ({ row }) => {
                return (
                    <span className="hitespace-nowrap">
                        {row.original.action.charAt(0).toUpperCase() +
                            row.original.action.slice(1)}
                    </span>
                );
            }
        },
        {
            accessorKey: "actor",
            header: ({ column }) => {
                return (
                    <div className="flex items-center gap-2">
                        <span>{t("actor")}</span>
                        <ColumnFilter
                            options={filterAttributes.actors.map((actor) => ({
                                value: actor,
                                label: actor
                            }))}
                            selectedValue={filters.actor}
                            onValueChange={(value) =>
                                handleFilterChange("actor", value)
                            }
                            // placeholder=""
                            searchPlaceholder="Search..."
                            emptyMessage="None found"
                        />
                    </div>
                );
            },
            cell: ({ row }) => {
                return (
                    <span className="flex items-center gap-1">
                        {row.original.actorType == "user" ? (
                            <User className="h-4 w-4" />
                        ) : (
                            <Key className="h-4 w-4" />
                        )}
                        {row.original.actor}
                    </span>
                );
            }
        },
        {
            accessorKey: "actorId",
            header: ({ column }) => {
                return t("actorId");
            },
            cell: ({ row }) => {
                return (
                    <span className="flex items-center gap-1">
                        {row.original.actorId}
                    </span>
                );
            }
        }
    ];

    const renderExpandedRow = (row: any) => {
        return (
            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div>
                        <strong>Metadata:</strong>
                        <pre className="text-muted-foreground mt-1 text-xs bg-background p-2 rounded border overflow-auto">
                            {row.metadata
                                ? JSON.stringify(
                                      JSON.parse(row.metadata),
                                      null,
                                      2
                                  )
                                : "N/A"}
                        </pre>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <>
            <SettingsSectionTitle
                title={t("actionLogs")}
                description={t("actionLogsDescription")}
            />

            <PaidFeaturesAlert tiers={tierMatrix.actionLogs} />

            <LogDataTable
                columns={columns}
                data={rows}
                title={t("actionLogs")}
                searchPlaceholder={t("searchLogs")}
                searchColumn="action"
                onRefresh={refreshData}
                isRefreshing={isRefreshing}
                onExport={() => startTransition(exportData)}
                // isExportDisabled={ // not disabling this because the user should be able to click the button and get the feedback about needing to upgrade the plan
                //     !isPaidUser(tierMatrix.logExport) || build === "oss"
                // }
                isExporting={isExporting}
                onDateRangeChange={handleDateRangeChange}
                dateRange={{
                    start: dateRange.startDate,
                    end: dateRange.endDate
                }}
                defaultSort={{
                    id: "timestamp",
                    desc: true
                }}
                // Server-side pagination props
                totalCount={totalCount}
                currentPage={currentPage}
                pageSize={pageSize}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
                isLoading={isLoading}
                // Row expansion props
                expandable={true}
                renderExpandedRow={renderExpandedRow}
                disabled={!isPaidUser(tierMatrix.actionLogs) || build === "oss"}
            />
        </>
    );
}
