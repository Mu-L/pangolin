"use client";
import { ColumnFilter } from "@app/components/ColumnFilter";
import { DateTimeValue } from "@app/components/DateTimePicker";
import { LogDataTable } from "@app/components/LogDataTable";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import { Button } from "@app/components/ui/button";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { toast } from "@app/hooks/useToast";
import { createApiClient } from "@app/lib/api";
import { useTranslations } from "next-intl";
import { getSevenDaysAgo } from "@app/lib/getSevenDaysAgo";
import { logQueries } from "@app/lib/queries";
import { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { ArrowUpRight, Key, Lock, Unlock, User } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { useStoredPageSize } from "@app/hooks/useStoredPageSize";
import { build } from "@server/build";
import type { QueryRequestAuditLogResponse } from "@server/routers/auditLogs/types";

export default function GeneralPage() {
    const router = useRouter();
    const api = createApiClient(useEnvContext());
    const t = useTranslations();
    const { orgId } = useParams();
    const searchParams = useSearchParams();

    const [isExporting, startTransition] = useTransition();

    const [currentPage, setCurrentPage] = useState<number>(0);
    const [pageSize, setPageSize] = useStoredPageSize("request-audit-logs", 20);

    const [filters, setFilters] = useState<{
        action?: string;
        resourceId?: string;
        host?: string;
        location?: string;
        actor?: string;
        method?: string;
        reason?: string;
        path?: string;
    }>({
        action: searchParams.get("action") || undefined,
        host: searchParams.get("host") || undefined,
        resourceId: searchParams.get("resourceId") || undefined,
        location: searchParams.get("location") || undefined,
        actor: searchParams.get("actor") || undefined,
        method: searchParams.get("method") || undefined,
        reason: searchParams.get("reason") || undefined,
        path: searchParams.get("path") || undefined
    });

    const getDefaultDateRange = () => {
        const startParam = searchParams.get("start");
        const endParam = searchParams.get("end");
        if (startParam && endParam) {
            return {
                startDate: { date: new Date(startParam) },
                endDate: { date: new Date(endParam) }
            };
        }
        return {
            startDate: { date: getSevenDaysAgo() },
            endDate: { date: new Date() }
        };
    };

    const [dateRange, setDateRange] = useState<{
        startDate: DateTimeValue;
        endDate: DateTimeValue;
    }>(getDefaultDateRange());

    const queryFilters = useMemo(() => {
        let timeStart: string | undefined;
        let timeEnd: string | undefined;

        if (dateRange.startDate?.date) {
            const dt = new Date(dateRange.startDate.date);
            if (dateRange.startDate.time) {
                const [h, m, s] = dateRange.startDate.time
                    .split(":")
                    .map(Number);
                dt.setHours(h, m, s || 0);
            }
            timeStart = dt.toISOString();
        }

        if (dateRange.endDate?.date) {
            const dt = new Date(dateRange.endDate.date);
            if (dateRange.endDate.time) {
                const [h, m, s] = dateRange.endDate.time.split(":").map(Number);
                dt.setHours(h, m, s || 0);
            } else {
                const now = new Date();
                dt.setHours(
                    now.getHours(),
                    now.getMinutes(),
                    now.getSeconds(),
                    now.getMilliseconds()
                );
            }
            timeEnd = dt.toISOString();
        }

        return {
            timeStart,
            timeEnd,
            page: currentPage,
            pageSize,
            ...filters,
            resourceId: filters.resourceId
                ? Number(filters.resourceId)
                : undefined
        };
    }, [dateRange, currentPage, pageSize, filters]);

    const { data, isFetching, isLoading, refetch } = useQuery({
        ...logQueries.requests({
            orgId: orgId as string,
            filters: queryFilters
        }),
        enabled: build !== "oss"
    });

    const rows = isLoading ? generateSampleRequestLogs() : (data?.log ?? []);
    const totalCount = data?.pagination?.total ?? 0;
    const filterAttributes = data?.filterAttributes ?? {
        actors: [],
        resources: [],
        locations: [],
        hosts: [],
        paths: []
    };

    const handleDateRangeChange = (
        startDate: DateTimeValue,
        endDate: DateTimeValue
    ) => {
        setDateRange({ startDate, endDate });
        setCurrentPage(0);
        updateUrlParamsForAllFilters({
            start: startDate.date?.toISOString() || "",
            end: endDate.date?.toISOString() || ""
        });
    };

    const handlePageChange = (newPage: number) => {
        setCurrentPage(newPage);
    };

    const handlePageSizeChange = (newPageSize: number) => {
        setPageSize(newPageSize);
        setCurrentPage(0);
    };

    const handleFilterChange = (
        filterType: keyof typeof filters,
        value: string | undefined
    ) => {
        const newFilters = { ...filters, [filterType]: value };
        setFilters(newFilters);
        setCurrentPage(0);
        updateUrlParamsForAllFilters(newFilters);
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
            type?: string;
        }
    ) => {
        console.log("Date range changed:", { startDate, endDate, page, size });
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

            const res = await api.get(`/org/${orgId}/logs/request`, { params });
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
            const endDate = searchParams.get("end")
                ? dateRange.endDate
                : { date: new Date() };
            setDateRange((current) => ({ ...current, endDate }));
            // Refresh data with current date range and pagination
            await queryDateTime(
                dateRange.startDate,
                endDate,
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

            const response = await api.get(
                `/org/${orgId}/logs/request/export`,
                {
                    responseType: "blob",
                    params
                }
            );

            // Create a URL for the blob and trigger a download
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement("a");
            link.href = url;
            const epoch = Math.floor(Date.now() / 1000);
            link.setAttribute(
                "download",
                `request-audit-logs-${orgId}-${epoch}.csv`
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

    // 100 - Allowed by Rule
    // 101 - Allowed No Auth
    // 102 - Valid Access Token
    // 103 - Valid header auth
    // 104 - Valid Pincode
    // 105 - Valid Password
    // 106 - Valid email
    // 107 - Valid SSO
    // 108 - Connected Client

    // 201 - Resource Not Found
    // 202 - Resource Blocked
    // 203 - Dropped by Rule
    // 204 - No Sessions
    // 205 - Temporary Request Token
    // 299 - No More Auth Methods

    const reasonMap: any = {
        100: t("allowedByRule"),
        101: t("allowedNoAuth"),
        102: t("validAccessToken"),
        103: t("validHeaderAuth"),
        104: t("validPincode"),
        105: t("validPassword"),
        106: t("validEmail"),
        107: t("validSSO"),
        108: t("connectedClient"),
        201: t("resourceNotFound"),
        202: t("resourceBlocked"),
        203: t("droppedByRule"),
        204: t("noSessions"),
        205: t("temporaryRequestToken"),
        299: t("noMoreAuthMethods")
    };

    // resourceId: integer("resourceId"),
    // userAgent: text("userAgent"),
    // metadata: text("details"),
    // headers: text("headers"), // JSON blob
    // query: text("query"), // JSON blob
    // originalRequestURL: text("originalRequestURL"),
    // scheme: text("scheme"),

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
                            options={[
                                { value: "true", label: "Allowed" },
                                { value: "false", label: "Denied" }
                            ]}
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
                    <span className="flex items-center gap-1">
                        {row.original.action ? <>Allowed</> : <>Denied</>}
                    </span>
                );
            }
        },
        {
            accessorKey: "ip",
            header: ({ column }) => {
                return t("ip");
            }
        },
        {
            accessorKey: "location",
            header: ({ column }) => {
                return (
                    <div className="flex items-center gap-2">
                        <span>{t("location")}</span>
                        <ColumnFilter
                            options={filterAttributes.locations.map(
                                (location) => ({
                                    value: location,
                                    label: location
                                })
                            )}
                            selectedValue={filters.location}
                            onValueChange={(value) =>
                                handleFilterChange("location", value)
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
                        {row.original.location ? (
                            <span className="text-muted-foreground text-xs">
                                {row.original.location}
                            </span>
                        ) : (
                            <span className="text-muted-foreground text-xs">
                                -
                            </span>
                        )}
                    </span>
                );
            }
        },
        {
            accessorKey: "resourceName",
            header: ({ column }) => {
                return (
                    <div className="flex items-center gap-2">
                        <span>{t("resource")}</span>
                        <ColumnFilter
                            options={filterAttributes.resources.map((res) => ({
                                value: res.id.toString(),
                                label: res.name || "Unnamed Resource"
                            }))}
                            selectedValue={filters.resourceId}
                            onValueChange={(value) =>
                                handleFilterChange("resourceId", value)
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
                    <Link
                        href={
                            row.original.reason == 108 // for now the client will only have reason 108 so we know where to go
                                ? `/${row.original.orgId}/settings/resources/client?query=${row.original.resourceNiceId}`
                                : `/${row.original.orgId}/settings/resources/proxy/${row.original.resourceNiceId}`
                        }
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Button variant="outline" size="sm">
                            {row.original.resourceName}
                            <ArrowUpRight className="ml-2 h-3 w-3" />
                        </Button>
                    </Link>
                );
            }
        },
        {
            accessorKey: "host",
            header: ({ column }) => {
                return (
                    <div className="flex items-center gap-2">
                        <span>{t("host")}</span>
                        <ColumnFilter
                            options={filterAttributes.hosts.map((host) => ({
                                value: host,
                                label: host
                            }))}
                            selectedValue={filters.host}
                            onValueChange={(value) =>
                                handleFilterChange("host", value)
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
                        {row.original.tls ? (
                            <Lock className="h-4 w-4" />
                        ) : (
                            <Unlock className="h-4 w-4" />
                        )}
                        {row.original.host}
                    </span>
                );
            }
        },
        {
            accessorKey: "path",
            header: ({ column }) => {
                return (
                    <div className="flex items-center gap-2">
                        <span>{t("path")}</span>
                        <ColumnFilter
                            options={filterAttributes.paths.map((path) => ({
                                value: path,
                                label: path
                            }))}
                            selectedValue={filters.path}
                            onValueChange={(value) =>
                                handleFilterChange("path", value)
                            }
                            // placeholder=""
                            searchPlaceholder="Search..."
                            emptyMessage="None found"
                        />
                    </div>
                );
            }
        },

        // {
        //     accessorKey: "scheme",
        //     header: ({ column }) => {
        //         return t("scheme");
        //     },
        // },
        {
            accessorKey: "method",
            header: ({ column }) => {
                return (
                    <div className="flex items-center gap-2">
                        <span>{t("method")}</span>
                        <ColumnFilter
                            options={[
                                { value: "GET", label: "GET" },
                                { value: "POST", label: "POST" },
                                { value: "PUT", label: "PUT" },
                                { value: "DELETE", label: "DELETE" },
                                { value: "PATCH", label: "PATCH" },
                                { value: "HEAD", label: "HEAD" },
                                { value: "OPTIONS", label: "OPTIONS" }
                            ]}
                            selectedValue={filters.method}
                            onValueChange={(value) =>
                                handleFilterChange("method", value)
                            }
                            // placeholder=""
                            searchPlaceholder="Search..."
                            emptyMessage="None found"
                        />
                    </div>
                );
            }
        },
        {
            accessorKey: "reason",
            header: ({ column }) => {
                return (
                    <div className="flex items-center gap-2">
                        <span>{t("reason")}</span>
                        <ColumnFilter
                            options={[
                                { value: "100", label: t("allowedByRule") },
                                { value: "101", label: t("allowedNoAuth") },
                                { value: "102", label: t("validAccessToken") },
                                { value: "103", label: t("validHeaderAuth") },
                                { value: "104", label: t("validPincode") },
                                { value: "105", label: t("validPassword") },
                                { value: "106", label: t("validEmail") },
                                { value: "107", label: t("validSSO") },
                                { value: "108", label: t("connectedClient") },
                                { value: "201", label: t("resourceNotFound") },
                                { value: "202", label: t("resourceBlocked") },
                                { value: "203", label: t("droppedByRule") },
                                { value: "204", label: t("noSessions") },
                                {
                                    value: "205",
                                    label: t("temporaryRequestToken")
                                },
                                { value: "299", label: t("noMoreAuthMethods") }
                            ]}
                            selectedValue={filters.reason}
                            onValueChange={(value) =>
                                handleFilterChange("reason", value)
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
                        {reasonMap[row.original.reason]}
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
                        {row.original.actor ? (
                            <>
                                {row.original.actorType == "user" ? (
                                    <User className="h-4 w-4" />
                                ) : (
                                    <Key className="h-4 w-4" />
                                )}
                                {row.original.actor}
                            </>
                        ) : (
                            <>-</>
                        )}
                    </span>
                );
            }
        }
    ];

    const renderExpandedRow = (row: any) => {
        return (
            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    {/* <div>
                        <strong>User Agent:</strong>
                        <p className="text-muted-foreground mt-1 break-all">
                            {row.userAgent || "N/A"}
                        </p>
                    </div> */}
                    <div>
                        <strong>Original URL:</strong>
                        <p className="text-muted-foreground mt-1 break-all">
                            {row.originalRequestURL || "N/A"}
                        </p>
                    </div>
                    {/* <div>
                        <strong>Scheme:</strong>
                        <p className="text-muted-foreground mt-1">
                            {row.scheme || "N/A"}
                        </p>
                    </div> */}
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
                    {row.headers && (
                        <div className="md:col-span-2">
                            <strong>Headers:</strong>
                            <pre className="text-muted-foreground mt-1 text-xs bg-background p-2 rounded border overflow-auto">
                                {JSON.stringify(
                                    JSON.parse(row.headers),
                                    null,
                                    2
                                )}
                            </pre>
                        </div>
                    )}
                    {row.query && (
                        <div className="md:col-span-2">
                            <strong>Query Parameters:</strong>
                            <pre className="text-muted-foreground mt-1 text-xs bg-background p-2 rounded border overflow-auto">
                                {JSON.stringify(JSON.parse(row.query), null, 2)}
                            </pre>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <>
            <SettingsSectionTitle
                title={t("requestLogs")}
                description={t("requestLogsDescription")}
            />

            <LogDataTable
                columns={columns}
                data={rows}
                title={t("requestLogs")}
                searchPlaceholder={t("searchLogs")}
                searchColumn="host"
                onRefresh={() => refetch()}
                isRefreshing={isFetching}
                onExport={() => startTransition(exportData)}
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
                totalCount={totalCount}
                currentPage={currentPage}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
                isLoading={isLoading}
                pageSize={pageSize}
                // Row expansion props
                expandable={true}
                renderExpandedRow={renderExpandedRow}
            />
        </>
    );
}

function generateSampleRequestLogs(): QueryRequestAuditLogResponse["log"] {
    const methods = ["GET", "POST", "PUT", "DELETE", "PATCH"];
    const paths = [
        "/api/v1/users",
        "/dashboard",
        "/settings",
        "/health",
        "/metrics"
    ];
    const hosts = ["app.example.com", "api.example.com", "admin.example.com"];
    const locations = ["US", "DE", "GB", "FR", "JP", "CA", "AU"];
    const allowedReasons = [100, 101, 102, 103, 104, 105, 106, 107, 108];
    const deniedReasons = [201, 202, 203, 204, 205, 299];
    const actors = [
        "alice@example.com",
        "bob@example.com",
        "carol@example.com",
        null
    ];

    const now = Math.floor(Date.now() / 1000);
    const sevenDaysAgo = now - 7 * 24 * 60 * 60;

    return Array.from({ length: 10 }, (_, i) => {
        const action = Math.random() > 0.3;
        const reason = action
            ? allowedReasons[Math.floor(Math.random() * allowedReasons.length)]
            : deniedReasons[Math.floor(Math.random() * deniedReasons.length)];
        const actor = actors[Math.floor(Math.random() * actors.length)];

        return {
            timestamp: Math.floor(
                sevenDaysAgo + Math.random() * (now - sevenDaysAgo)
            ),
            action,
            reason,
            orgId: "sample-org",
            actorType: actor ? "user" : null,
            actor,
            actorId: actor ? `user-${i}` : null,
            resourceId: Math.floor(Math.random() * 5) + 1,
            siteResourceId: null,
            resourceNiceId: `resource-${(i % 3) + 1}`,
            resourceName: `Resource ${(i % 3) + 1}`,
            ip: `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
            location: locations[Math.floor(Math.random() * locations.length)],
            userAgent: "Mozilla/5.0",
            metadata: null,
            headers: null,
            query: null,
            originalRequestURL: null,
            scheme: "https",
            host: hosts[Math.floor(Math.random() * hosts.length)],
            path: paths[Math.floor(Math.random() * paths.length)],
            method: methods[Math.floor(Math.random() * methods.length)],
            tls: true
        };
    });
}
