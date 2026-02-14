"use client";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useNavigationContext } from "@app/hooks/useNavigationContext";
import { toast } from "@app/hooks/useToast";
import { createApiClient } from "@app/lib/api";
import type { ListResourcePoliciesResponse } from "@server/routers/resource/types";
import type { PaginationState } from "@tanstack/react-table";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { ExtendedColumnDef } from "./ui/data-table";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "./ui/dropdown-menu";
import { Button } from "./ui/button";
import { MoreHorizontal, ArrowRight } from "lucide-react";
import Link from "next/link";
import { ControlledDataTable } from "./ui/controlled-data-table";
import { useDebouncedCallback } from "use-debounce";

type ResourcePolicyRow = ListResourcePoliciesResponse["policies"][number];

export type ResourcePoliciesTableProps = {
    policies: Array<ResourcePolicyRow>;
    orgId: string;
    pagination: PaginationState;
    rowCount: number;
};

export function ResourcePoliciesTable({
    policies,
    orgId,
    pagination,
    rowCount
}: ResourcePoliciesTableProps) {
    const router = useRouter();
    const {
        navigate: filter,
        isNavigating: isFiltering,
        searchParams
    } = useNavigationContext();
    const t = useTranslations();

    const { env } = useEnvContext();

    const api = createApiClient({ env });

    const [isRefreshing, startTransition] = useTransition();
    const [isNavigatingToAddPage, startNavigation] = useTransition();

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

    const proxyColumns: ExtendedColumnDef<ResourcePolicyRow>[] = [
        {
            accessorKey: "name",
            enableHiding: false,
            friendlyName: t("name"),
            header: () => <span className="p-3">{t("name")}</span>
        },
        {
            id: "niceId",
            accessorKey: "nice",
            friendlyName: t("identifier"),
            enableHiding: true,
            header: () => <span className="p-3">{t("identifier")}</span>,
            cell: ({ row }) => {
                return <span>{row.original.niceId || "-"}</span>;
            }
        },
        {
            id: "actions",
            enableHiding: false,
            header: () => <span className="p-3"></span>,
            cell: ({ row }) => {
                const policyRow = row.original;
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
                                <Link
                                    className="block w-full"
                                    href={`/${policyRow.orgId}/settings/resources/proxy/${policyRow.niceId}`}
                                >
                                    <DropdownMenuItem>
                                        {t("viewSettings")}
                                    </DropdownMenuItem>
                                </Link>
                                <DropdownMenuItem
                                    onClick={() => {
                                        // setSelectedResource(resourceRow);
                                        // setIsDeleteModalOpen(true);
                                    }}
                                >
                                    <span className="text-red-500">
                                        {t("delete")}
                                    </span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Link
                            href={`/${policyRow.orgId}/settings/resources/proxy/${policyRow.niceId}`}
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
            <ControlledDataTable
                columns={proxyColumns}
                rows={policies}
                tableId="resource-policies"
                searchPlaceholder={t("resourcePoliciesSearch")}
                pagination={pagination}
                rowCount={rowCount}
                onSearch={handleSearchChange}
                onPaginationChange={handlePaginationChange}
                onAdd={() =>
                    startNavigation(() =>
                        router.push(
                            `/${orgId}/settings/resources/policies/create`
                        )
                    )
                }
                addButtonText={t("resourcePoliciesAdd")}
                onRefresh={refreshData}
                isRefreshing={isRefreshing || isFiltering}
                isNavigatingToAddPage={isNavigatingToAddPage}
                enableColumnVisibility
                columnVisibility={{ niceId: false }}
                stickyLeftColumn="name"
                stickyRightColumn="actions"
            />
        </>
    );
}
