"use client";
import { ColumnFilterButton } from "@app/components/ColumnFilterButton";
import { DateTimeValue } from "@app/components/DateTimePicker";
import { LogDataTable } from "@app/components/LogDataTable";
import { AiSessionChatView } from "@app/components/AiSessionChatView";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import { Button } from "@app/components/ui/button";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { toast } from "@app/hooks/useToast";
import { createApiClient } from "@app/lib/api";
import { useTranslations } from "next-intl";
import { getSevenDaysAgo } from "@app/lib/getSevenDaysAgo";
import { getPrivateResourceSettingsHref } from "@app/lib/launcherResourceAdminHref";
import { logQueries } from "@app/lib/queries";
import { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { ArrowUpRight, Bot, Waves, User } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { useStoredPageSize } from "@app/hooks/useStoredPageSize";
import type { QueryAiSessionLogResponse } from "@server/routers/auditLogs/types";

const capabilityLabels: Record<string, string> = {
    openai_chat: "OpenAI Chat Completions",
    openai_responses: "OpenAI Responses",
    anthropic_messages: "Anthropic Messages",
    gemini_generate_content: "Gemini",
    google_generate_content: "Vertex AI (Generate Content)",
    google_raw_predict: "Vertex AI (Raw Predict)",
    bedrock_model_invoke: "Bedrock (Invoke Model)",
    bedrock_converse: "Bedrock (Converse)"
};

export default function AiSessionLogsPage() {
    const router = useRouter();
    const api = createApiClient(useEnvContext());
    const t = useTranslations();
    const { orgId } = useParams();
    const searchParams = useSearchParams();

    const [isExporting, startTransition] = useTransition();

    const [currentPage, setCurrentPage] = useState<number>(0);
    const [pageSize, setPageSize] = useStoredPageSize("ai-session-logs", 20);

    const [filters, setFilters] = useState<{
        providerId?: string;
        capability?: string;
        resourceId?: string;
        actor?: string;
        isStream?: string;
    }>({
        providerId: searchParams.get("providerId") || undefined,
        capability: searchParams.get("capability") || undefined,
        resourceId: searchParams.get("resourceId") || undefined,
        actor: searchParams.get("actor") || undefined,
        isStream: searchParams.get("isStream") || undefined
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
            ...filters
        };
    }, [dateRange, currentPage, pageSize, filters]);

    const { data, isFetching, isLoading, refetch } = useQuery({
        ...logQueries.aiSessions({
            orgId: orgId as string,
            filters: queryFilters
        })
    });

    const rows = isLoading ? generateSampleAiSessionLogs() : (data?.log ?? []);
    const totalCount = data?.pagination?.total ?? 0;
    const filterAttributes = data?.filterAttributes ?? {
        providers: [],
        resources: [],
        users: []
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

    const exportData = async () => {
        try {
            const params: any = {
                timeStart: dateRange.startDate?.date
                    ? new Date(dateRange.startDate.date).toISOString()
                    : undefined,
                timeEnd: dateRange.endDate?.date
                    ? new Date(dateRange.endDate.date).toISOString()
                    : undefined,
                ...filters
            };

            const response = await api.get(`/org/${orgId}/logs/ai/export`, {
                responseType: "blob",
                params
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement("a");
            link.href = url;
            const epoch = Math.floor(Date.now() / 1000);
            link.setAttribute(
                "download",
                `ai-session-logs-${orgId}-${epoch}.csv`
            );
            document.body.appendChild(link);
            link.click();
            link.parentNode?.removeChild(link);
        } catch (error) {
            let apiErrorMessage: string | null = null;
            if (axios.isAxiosError(error) && error.response) {
                const data = error.response.data;

                if (data instanceof Blob && data.type === "application/json") {
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
            accessorKey: "createdAt",
            header: ({ column }) => (
                <span className="px-2">{t("timestamp")}</span>
            ),
            cell: ({ row }) => {
                return (
                    <div className="whitespace-nowrap">
                        {new Date(row.original.createdAt).toLocaleString()}
                    </div>
                );
            }
        },
        {
            accessorKey: "providerName",
            header: ({ column }) => {
                return (
                    <div className="flex items-center gap-2 px-2">
                        <ColumnFilterButton
                            options={filterAttributes.providers.map(
                                (provider) => ({
                                    value: provider.id.toString(),
                                    label: provider.name || "Unnamed Provider"
                                })
                            )}
                            selectedValue={filters.providerId}
                            onValueChange={(value) =>
                                handleFilterChange("providerId", value)
                            }
                            label={t("provider")}
                            searchPlaceholder={t("searchPlaceholder")}
                            emptyMessage={t("emptySearchOptions")}
                        />
                    </div>
                );
            },
            cell: ({ row }) => {
                return (
                    <span className="flex items-center gap-1">
                        <Bot className="h-4 w-4" />
                        {row.original.providerName || "-"}
                    </span>
                );
            }
        },
        {
            accessorKey: "capability",
            header: ({ column }) => {
                return (
                    <div className="flex items-center gap-2 px-2">
                        <ColumnFilterButton
                            options={Object.entries(capabilityLabels).map(
                                ([value, label]) => ({ value, label })
                            )}
                            selectedValue={filters.capability}
                            onValueChange={(value) =>
                                handleFilterChange("capability", value)
                            }
                            label={t("capability")}
                            searchPlaceholder={t("searchPlaceholder")}
                            emptyMessage={t("emptySearchOptions")}
                        />
                    </div>
                );
            },
            cell: ({ row }) => {
                return (
                    <span className="text-xs">
                        {capabilityLabels[row.original.capability] ||
                            row.original.capability}
                    </span>
                );
            }
        },
        {
            accessorKey: "requestedModel",
            header: ({ column }) => (
                <span className="px-2">{t("model")}</span>
            ),
            cell: ({ row }) => {
                return (
                    <span className="text-xs text-muted-foreground">
                        {row.original.requestedModel || "-"}
                    </span>
                );
            }
        },
        {
            accessorKey: "resourceName",
            header: ({ column }) => {
                return (
                    <div className="flex items-center gap-2 px-2">
                        <ColumnFilterButton
                            options={filterAttributes.resources.map((res) => ({
                                value: res.id.toString(),
                                label: res.name || "Unnamed Resource"
                            }))}
                            selectedValue={filters.resourceId}
                            onValueChange={(value) =>
                                handleFilterChange("resourceId", value)
                            }
                            label={t("resource")}
                            searchPlaceholder={t("searchPlaceholder")}
                            emptyMessage={t("emptySearchOptions")}
                        />
                    </div>
                );
            },
            cell: ({ row }) => {
                if (!row.original.resourceNiceId) {
                    return <span className="text-xs text-muted-foreground">-</span>;
                }
                return (
                    <Link
                        href={
                            row.original.resourceType === "site"
                                ? getPrivateResourceSettingsHref(
                                      row.original.orgId,
                                      row.original.resourceNiceId
                                  )
                                : `/${row.original.orgId}/settings/resources/public/${row.original.resourceNiceId}`
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
            accessorKey: "isStream",
            header: ({ column }) => {
                return (
                    <div className="flex items-center gap-2 px-2">
                        <ColumnFilterButton
                            options={[
                                { value: "true", label: t("streaming") },
                                { value: "false", label: t("nonStreaming") }
                            ]}
                            label={t("stream")}
                            selectedValue={filters.isStream}
                            onValueChange={(value) =>
                                handleFilterChange("isStream", value)
                            }
                            searchPlaceholder={t("searchPlaceholder")}
                            emptyMessage={t("emptySearchOptions")}
                        />
                    </div>
                );
            },
            cell: ({ row }) => {
                return (
                    <span className="flex items-center gap-1">
                        {row.original.isStream ? (
                            <>
                                <Waves className="h-4 w-4" />
                                {t("streaming")}
                            </>
                        ) : (
                            <span className="text-muted-foreground text-xs">
                                {t("nonStreaming")}
                            </span>
                        )}
                    </span>
                );
            }
        },
        {
            accessorKey: "userEmail",
            header: ({ column }) => {
                return (
                    <div className="flex items-center gap-2 px-2">
                        <ColumnFilterButton
                            options={filterAttributes.users.map((user) => ({
                                value: user.id,
                                label: user.email || user.id
                            }))}
                            selectedValue={filters.actor}
                            onValueChange={(value) =>
                                handleFilterChange("actor", value)
                            }
                            label={t("actor")}
                            searchPlaceholder={t("searchPlaceholder")}
                            emptyMessage={t("emptySearchOptions")}
                        />
                    </div>
                );
            },
            cell: ({ row }) => {
                return (
                    <span className="flex items-center gap-1">
                        {row.original.userEmail ? (
                            <>
                                <User className="h-4 w-4" />
                                {row.original.userEmail}
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
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                    <div>
                        <strong>{t("aiSessionId")}</strong>
                        <p className="text-muted-foreground mt-1 break-all">
                            {row.sessionId}
                        </p>
                    </div>
                    <div>
                        <strong>{t("statusCode")}</strong>
                        <p className="text-muted-foreground mt-1">
                            {row.statusCode ?? "N/A"}
                        </p>
                    </div>
                    <div>
                        <strong>{t("model")}</strong>
                        <p className="text-muted-foreground mt-1 break-all">
                            {row.requestedModel || "N/A"}
                        </p>
                    </div>
                    <div>
                        <strong>{t("capability")}</strong>
                        <p className="text-muted-foreground mt-1 break-all">
                            {capabilityLabels[row.capability] || row.capability}
                        </p>
                    </div>
                </div>
                <AiSessionChatView
                    normalizedRequest={row.normalizedRequest}
                    normalizedResponse={row.normalizedResponse}
                    requestBody={row.requestBody}
                    responseBody={row.responseBody}
                    truncated={row.truncated}
                />
            </div>
        );
    };

    return (
        <>
            <SettingsSectionTitle
                title={t("aiSessionLogs")}
                description={t("aiSessionLogsDescription")}
            />

            <LogDataTable
                columns={columns}
                data={rows}
                title={t("aiSessionLogs")}
                searchPlaceholder={t("searchLogs")}
                searchColumn="providerName"
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
                    id: "createdAt",
                    desc: true
                }}
                totalCount={totalCount}
                currentPage={currentPage}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
                isLoading={isLoading}
                pageSize={pageSize}
                expandable={true}
                renderExpandedRow={renderExpandedRow}
            />
        </>
    );
}

function generateSampleAiSessionLogs(): QueryAiSessionLogResponse["log"] {
    const capabilities = Object.keys(capabilityLabels);
    const providers = [
        { id: 1, name: "OpenAI Production" },
        { id: 2, name: "Anthropic Default" },
        { id: 3, name: "Vertex AI" }
    ];
    const resourcesSample = [
        { id: 1, niceId: "resource-1", name: "Resource 1" },
        { id: 2, niceId: "resource-2", name: "Resource 2" }
    ];
    const actors = ["alice@example.com", "bob@example.com", null];
    const models = ["gpt-4o", "claude-sonnet-5", "gemini-2.5-pro"];

    const now = Date.now();
    const sevenDaysAgoMs = now - 7 * 24 * 60 * 60 * 1000;

    return Array.from({ length: 10 }, (_, i) => {
        const provider = providers[Math.floor(Math.random() * providers.length)];
        const resource =
            resourcesSample[Math.floor(Math.random() * resourcesSample.length)];
        const actor = actors[Math.floor(Math.random() * actors.length)];

        return {
            id: i,
            sessionId: `sample-session-${i}`,
            orgId: "sample-org",
            providerId: provider.id,
            providerName: provider.name,
            providerType: "openai",
            capability:
                capabilities[Math.floor(Math.random() * capabilities.length)],
            resourceId: resource.id,
            siteResourceId: null,
            resourceName: resource.name,
            resourceNiceId: resource.niceId,
            resourceType: "public",
            userId: actor ? `user-${i}` : null,
            userEmail: actor,
            requestedModel: models[Math.floor(Math.random() * models.length)],
            isStream: Math.random() > 0.5,
            requestBody: null,
            responseBody: null,
            normalizedRequest: null,
            normalizedResponse: null,
            truncated: false,
            statusCode: 200,
            createdAt: Math.floor(
                sevenDaysAgoMs + Math.random() * (now - sevenDaysAgoMs)
            )
        };
    });
}
