"use client";

import { Button } from "@app/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@app/components/ui/dropdown-menu";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useNavigationContext } from "@app/hooks/useNavigationContext";
import { toast } from "@app/hooks/useToast";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { type PaginationState } from "@tanstack/react-table";
import {
    ArrowDown01Icon,
    ArrowUp10Icon,
    ChevronsUpDownIcon,
    MoreHorizontal,
    PencilIcon,
    PencilLineIcon
} from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useActionState, useMemo, useState, useTransition } from "react";
import { useDebouncedCallback } from "use-debounce";
import {
    ControlledDataTable,
    type ExtendedColumnDef
} from "./ui/controlled-data-table";
import { LabelBadge } from "./label-badge";
import { getNextSortOrder, getSortDirection } from "@app/lib/sortColumn";
import { cn } from "@app/lib/cn";
import ConfirmDeleteDialog from "./ConfirmDeleteDialog";

export type LabelRow = {
    labelId: number;
    name: string;
    color: string;
};

type OrgLabelsTableProps = {
    labels: LabelRow[];
    pagination: PaginationState;
    orgId: string;
    rowCount: number;
};

export default function OrgLabelsTable({
    labels,
    orgId,
    pagination,
    rowCount
}: OrgLabelsTableProps) {
    const router = useRouter();
    const pathname = usePathname();
    const {
        navigate: filter,
        isNavigating: isFiltering,
        searchParams
    } = useNavigationContext();

    const [selectedLabel, setSelectedLabel] = useState<LabelRow | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    const [isRefreshing, startRefreshTransition] = useTransition();

    const api = createApiClient(useEnvContext());
    const t = useTranslations();

    function refreshData() {
        startRefreshTransition(async () => {
            try {
                router.refresh();
            } catch {
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
        filter({ searchParams: newSearch });
    }

    const handlePaginationChange = (newPage: PaginationState) => {
        searchParams.set("page", (newPage.pageIndex + 1).toString());
        searchParams.set("pageSize", newPage.pageSize.toString());
        filter({ searchParams });
    };

    const handleSearchChange = useDebouncedCallback((query: string) => {
        searchParams.set("query", query);
        searchParams.delete("page");
        filter({ searchParams });
    }, 300);

    const columns = useMemo<ExtendedColumnDef<LabelRow>[]>(
        () => [
            {
                accessorKey: "name",
                enableHiding: false,
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
                },
                cell: ({ row }) => <EditLabelCell label={row.original} />
            },
            {
                accessorKey: "actions",
                enableHiding: false,
                header: () => {
                    return <span className="p-3">{t("actions")}</span>;
                },
                cell: ({ row }) => (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">{t("openMenu")}</span>
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem>{t("edit")}</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => {}}>
                                <span className="text-red-500">
                                    {t("delete")}
                                </span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )
            }
        ],
        [searchParams, t]
    );

    async function deleteLabel() {
        // ...
    }

    return (
        <>
            {selectedLabel && (
                <ConfirmDeleteDialog
                    open={isDeleteModalOpen}
                    setOpen={(val) => {
                        setIsDeleteModalOpen(val);
                        setSelectedLabel(null);
                    }}
                    dialog={
                        <div className="space-y-2">
                            <p>{t("resourceQuestionRemove")}</p>
                            <p>{t("resourceMessageRemove")}</p>
                        </div>
                    }
                    buttonText={t("resourceDeleteConfirm")}
                    onConfirm={async () => {}}
                    string={selectedLabel.name}
                    title={t("resourceDelete")}
                />
            )}
            <ControlledDataTable
                columns={columns}
                rows={labels}
                tableId="org-labels-table"
                searchPlaceholder={t("labelSearch")}
                pagination={pagination}
                onPaginationChange={handlePaginationChange}
                searchQuery={searchParams.get("query")?.toString()}
                onSearch={handleSearchChange}
                onRefresh={refreshData}
                isRefreshing={isRefreshing || isFiltering}
                rowCount={rowCount}
            />
        </>
    );
}

type EditLabelCellProps = {
    label: LabelRow;
};

function EditLabelCell({ label }: EditLabelCellProps) {
    const t = useTranslations();

    return (
        <div className="flex items-center gap-1.5 group">
            <div
                className="size-2.5 rounded-full bg-(--color) flex-none"
                style={{
                    // @ts-expect-error css color
                    "--color": label.color
                }}
            />

            {label.name}

            {/* <Button
                variant="ghost"
                size="sm"
                className={cn(
                    "opacity-0 group-hover:opacity-100 text-xs",
                    "inline-flex gap-2 items-center"
                )}
            >
                {t("edit")}
                <PencilIcon className="size-3 flex-none" />
            </Button> */}
        </div>
    );
}
