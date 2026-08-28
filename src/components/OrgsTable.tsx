"use client";

import { Button } from "@app/components/ui/button";
import {
    ControlledDataTable,
    type ExtendedColumnDef
} from "@app/components/ui/controlled-data-table";
import { useNavigationContext } from "@app/hooks/useNavigationContext";
import { toast } from "@app/hooks/useToast";
import { getNextSortOrder, getSortDirection } from "@app/lib/sortColumn";
import type { AdminOrgRow } from "@server/routers/org";
import { type PaginationState } from "@tanstack/react-table";
import {
    ArrowDown01Icon,
    ArrowUp10Icon,
    ArrowUpRight,
    ChevronsUpDownIcon
} from "lucide-react";
import moment from "moment";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useTransition } from "react";
import { useDebouncedCallback } from "use-debounce";

type OrgTableProps = {
    orgs: AdminOrgRow[];
    pagination: PaginationState;
    rowCount: number;
};

export default function OrgsTable({
    orgs,
    pagination,
    rowCount
}: OrgTableProps) {
    const router = useRouter();
    const t = useTranslations();
    const {
        navigate: filter,
        isNavigating: isFiltering,
        searchParams
    } = useNavigationContext();

    const [isRefreshing, startTransition] = useTransition();

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

    function toggleSort(column: string) {
        const newSearch = getNextSortOrder(column, searchParams);

        filter({
            searchParams: newSearch
        });
    }

    function sortableHeader(column: string, label: string) {
        const sortOrder = getSortDirection(column, searchParams);
        const Icon =
            sortOrder === "asc"
                ? ArrowDown01Icon
                : sortOrder === "desc"
                  ? ArrowUp10Icon
                  : ChevronsUpDownIcon;

        return (
            <Button
                variant="ghost"
                className="p-3"
                onClick={() => toggleSort(column)}
            >
                {label}
                <Icon className="ml-2 h-4 w-4" />
            </Button>
        );
    }

    const columns = useMemo<ExtendedColumnDef<AdminOrgRow>[]>(() => {
        return [
            {
                accessorKey: "name",
                friendlyName: t("name"),
                enableHiding: false,
                header: () => sortableHeader("name", t("name"))
            },
            {
                accessorKey: "createdAt",
                friendlyName: t("createdAt"),
                header: () => sortableHeader("createdAt", t("createdAt")),
                cell: ({ row }) => {
                    const createdAt = row.original.createdAt;
                    return (
                        <span>
                            {createdAt ? moment(createdAt).format("lll") : "-"}
                        </span>
                    );
                }
            },
            {
                accessorKey: "owner",
                friendlyName: t("accessRoleOwner"),
                header: () => (
                    <span className="p-3">{t("accessRoleOwner")}</span>
                ),
                cell: ({ row }) => {
                    const owner = row.original.owner;
                    return owner ? (
                        <Button
                            className="tabular-nums"
                            asChild
                            variant="outline"
                            size="sm"
                        >
                            <Link href={`/admin/users/${owner.userId}`}>
                                {owner.username}
                                <ArrowUpRight className="ml-2 h-3 w-3" />
                            </Link>
                        </Button>
                    ) : (
                        <code>-</code>
                    );
                }
            },
            {
                accessorKey: "orgId",
                friendlyName: t("orgId"),
                header: () => <span className="p-3">{t("orgId")}</span>
            },
            {
                accessorKey: "subnet",
                friendlyName: t("subnet"),
                header: () => <span className="p-3">{t("subnet")}</span>,
                cell: ({ row }) => <span>{row.original.subnet || "-"}</span>
            },
            {
                accessorKey: "utilitySubnet",
                friendlyName: t("utilitySubnet"),
                header: () => <span className="p-3">{t("utilitySubnet")}</span>,
                cell: ({ row }) => (
                    <span>{row.original.utilitySubnet || "-"}</span>
                )
            },
            {
                accessorKey: "userCount",
                friendlyName: t("users"),
                header: () => <span className="p-3">{t("users")}</span>,
                cell: ({ row }) => (
                    <span className="tabular-nums">
                        {row.original.userCount}
                    </span>
                )
            },
            {
                accessorKey: "siteCount",
                friendlyName: t("sites"),
                header: () => <span className="p-3">{t("sites")}</span>,
                cell: ({ row }) => (
                    <span className="tabular-nums">
                        {row.original.siteCount}
                    </span>
                )
            },
            {
                accessorKey: "resourceCount",
                friendlyName: t("resources"),
                header: () => <span className="p-3">{t("resources")}</span>,
                cell: ({ row }) => (
                    <span className="tabular-nums">
                        {row.original.resourceCount}
                    </span>
                )
            },

            {
                id: "actions",
                enableHiding: false,
                header: () => <span className="p-3"></span>,
                cell: ({ row }) => {
                    const orgRow = row.original;
                    return (
                        <div className="flex items-center gap-2 justify-end">
                            <Button
                                variant="outline"
                                className="text-red-400 focus:text-destructive "
                            >
                                {t("delete")}
                            </Button>
                        </div>
                    );
                }
            }
        ];
    }, [t, searchParams]);

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
        <ControlledDataTable
            columns={columns}
            rows={orgs}
            tableId="admin-orgs-table"
            searchPlaceholder={t("orgSearch")}
            pagination={pagination}
            onPaginationChange={handlePaginationChange}
            searchQuery={searchParams.get("query")?.toString()}
            onSearch={handleSearchChange}
            onRefresh={refreshData}
            isRefreshing={isRefreshing || isFiltering}
            rowCount={rowCount}
            columnVisibility={{
                subnet: false,
                utilitySubnet: false,
                orgId: false
            }}
            enableColumnVisibility
            stickyLeftColumn="name"
            stickyRightColumn="actions"
        />
    );
}
