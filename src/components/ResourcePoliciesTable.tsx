"use client";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useNavigationContext } from "@app/hooks/useNavigationContext";
import { toast } from "@app/hooks/useToast";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import type {
    AttachedResource,
    ListResourcePoliciesResponse
} from "@server/routers/resource/types";
import type { PaginationState } from "@tanstack/react-table";
import {
    ArrowRight,
    ChevronDown,
    MoreHorizontal,
    Waypoints
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useDebouncedCallback } from "use-debounce";
import { Button } from "./ui/button";
import { ControlledDataTable } from "./ui/controlled-data-table";
import type { ExtendedColumnDef } from "./ui/data-table";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "./ui/dropdown-menu";
import ConfirmDeleteDialog from "./ConfirmDeleteDialog";
import { PaidFeaturesAlert } from "./PaidFeaturesAlert";
import { tierMatrix, TierFeature } from "@server/lib/billing/tierMatrix";

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

    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [selectedResourcePolicy, setSelectedResourcePolicy] =
        useState<ResourcePolicyRow | null>(null);

    const deleteResourcePolicy = async (resourcePolicyId: number) => {
        await api
            .delete(`/resource-policy/${resourcePolicyId}`)
            .catch((e) => {
                console.error(t("resourceErrorDelte"), e);
                toast({
                    variant: "destructive",
                    title: t("resourceErrorDelte"),
                    description: formatAxiosError(e, t("resourceErrorDelte"))
                });
            })
            .then(() => {
                router.refresh();
                setIsDeleteModalOpen(false);
            });
    };

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

    function ResourceListCell({
        resources
    }: {
        resources?: AttachedResource[];
    }) {
        if (!resources || resources.length === 0) {
            return (
                <div
                    id="LOOK_FOR_ME"
                    className="flex items-center gap-2 text-muted-foreground"
                >
                    <Waypoints className="size-4 flex-none" />
                    <span className="text-sm">
                        {t("resourcePoliciesAttachedResourcesEmpty")}
                    </span>
                </div>
            );
        }

        return (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="flex items-center gap-2 h-8 px-0 font-normal"
                    >
                        <Waypoints className="size-4 flex-none" />
                        <span className="text-sm">
                            {t("resourcePoliciesAttachedResources", {
                                count: resources.length
                            })}
                        </span>
                        <ChevronDown className="h-3 w-3" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-70">
                    {resources.map((resource) => (
                        <DropdownMenuItem
                            key={resource.resourceId}
                            className="flex items-center justify-between gap-4"
                        >
                            <div className="flex items-center gap-2">
                                {resource.name}
                            </div>
                            <span
                                className={`capitalize text-muted-foreground`}
                            >
                                {resource.fullDomain}
                            </span>
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        );
    }

    const proxyColumns: ExtendedColumnDef<ResourcePolicyRow>[] = [
        {
            accessorKey: "name",
            enableHiding: false,
            friendlyName: t("name"),
            header: () => <span className="p-3">{t("name")}</span>,
            cell: ({ row }) => <span>{row.original.name}</span>
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
            id: "resources",
            accessorKey: "resources",
            friendlyName: t("resourcePoliciesAttachedResourcesColumnTitle"),
            header: () => (
                <span className="p-3">
                    {t("resourcePoliciesAttachedResourcesColumnTitle")}
                </span>
            ),
            cell: ({ row }) => {
                return <ResourceListCell resources={row.original.resources} />;
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
                                    href={`/${policyRow.orgId}/settings/policies/resource/${policyRow.niceId}`}
                                >
                                    <DropdownMenuItem>
                                        {t("viewSettings")}
                                    </DropdownMenuItem>
                                </Link>
                                <DropdownMenuItem
                                    onClick={() => {
                                        setSelectedResourcePolicy(policyRow);
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
                            href={`/${policyRow.orgId}/settings/policies/resource/${policyRow.niceId}`}
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
            <PaidFeaturesAlert
                tiers={tierMatrix[TierFeature.ResourcePolicies]}
            />
            {selectedResourcePolicy && (
                <ConfirmDeleteDialog
                    open={isDeleteModalOpen}
                    setOpen={(val) => {
                        setIsDeleteModalOpen(val);
                        setSelectedResourcePolicy(null);
                    }}
                    dialog={
                        <div className="space-y-2">
                            <p>{t("resourcePolicyQuestionRemove")}</p>
                            <p>{t("resourcePolicyMessageRemove")}</p>
                        </div>
                    }
                    buttonText={t("resourcePolicyDeleteConfirm")}
                    onConfirm={async () =>
                        deleteResourcePolicy(
                            selectedResourcePolicy.resourcePolicyId
                        )
                    }
                    string={selectedResourcePolicy.name}
                    title={t("resourcePolicyDelete")}
                />
            )}
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
                            `/${orgId}/settings/policies/resource/create`
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
