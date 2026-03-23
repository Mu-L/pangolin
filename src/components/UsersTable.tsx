"use client";

import { ColumnDef, type PaginationState } from "@tanstack/react-table";
import { ExtendedColumnDef } from "@app/components/ui/data-table";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@app/components/ui/dropdown-menu";
import { Button } from "@app/components/ui/button";
import {
    ArrowDown01Icon,
    ArrowRight,
    ArrowUp10Icon,
    ArrowUpDown,
    ChevronsUpDownIcon,
    Crown,
    MoreHorizontal
} from "lucide-react";
import { UsersDataTable } from "@app/components/UsersDataTable";
import { useState, useEffect, useTransition } from "react";
import ConfirmDeleteDialog from "@app/components/ConfirmDeleteDialog";
import { useOrgContext } from "@app/hooks/useOrgContext";
import { toast } from "@app/hooks/useToast";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { formatAxiosError } from "@app/lib/api";
import { createApiClient } from "@app/lib/api";
import { getUserDisplayName } from "@app/lib/getUserDisplayName";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useUserContext } from "@app/hooks/useUserContext";
import { useTranslations } from "next-intl";
import IdpTypeBadge from "./IdpTypeBadge";
import { ControlledDataTable } from "./ui/controlled-data-table";
import type { filter } from "d3";
import { useDebouncedCallback } from "use-debounce";
import { useNavigationContext } from "@app/hooks/useNavigationContext";
import { getNextSortOrder, getSortDirection } from "@app/lib/sortColumn";

export type UserRow = {
    id: string;
    email: string | null;
    displayUsername: string | null;
    username: string;
    name: string | null;
    idpId: number | null;
    idpName: string;
    type: string;
    idpVariant: string | null;
    status: string;
    role: string;
    isOwner: boolean;
};

type UsersTableProps = {
    users: UserRow[];
    pagination: PaginationState;
    rowCount: number;
};

export default function UsersTable({
    users,
    pagination,
    rowCount
}: UsersTableProps) {
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
    const router = useRouter();
    const api = createApiClient(useEnvContext());
    const { user } = useUserContext();
    const { org } = useOrgContext();
    const t = useTranslations();
    const [isNavigatingToAddPage, startNavigation] = useTransition();
    const [isRefreshing, startTransition] = useTransition();
    const {
        navigate: filter,
        isNavigating: isFiltering,
        searchParams
    } = useNavigationContext();

    const refreshData = async () => {
        startTransition(async () => {
            try {
                await new Promise((resolve) => setTimeout(resolve, 200));
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

    const columns: ExtendedColumnDef<UserRow>[] = [
        {
            accessorKey: "displayUsername",
            enableHiding: false,
            friendlyName: t("username"),
            header: ({ column }) => {
                const nameOrder = getSortDirection("username", searchParams);
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
                        onClick={() => toggleSort("username")}
                    >
                        {t("username")}
                        <Icon className="ml-2 h-4 w-4" />
                    </Button>
                );
            }
        },
        {
            accessorKey: "idpName",
            friendlyName: t("identityProvider"),
            header: ({ column }) => {
                return <span className="px-3">{t("identityProvider")}</span>;
            },
            cell: ({ row }) => {
                const userRow = row.original;
                return (
                    <IdpTypeBadge
                        type={userRow.type}
                        name={userRow.idpName}
                        variant={userRow.idpVariant || undefined}
                    />
                );
            }
        },
        {
            accessorKey: "role",
            friendlyName: t("role"),
            header: ({ column }) => {
                return <span className="px-3">{t("role")}</span>;
            },
            cell: ({ row }) => {
                const userRow = row.original;

                return (
                    <div className="flex flex-row items-center gap-2">
                        <span>{userRow.role}</span>
                    </div>
                );
            }
        },
        {
            id: "actions",
            enableHiding: false,
            header: () => <span className="p-3"></span>,
            cell: ({ row }) => {
                const userRow = row.original;
                const isCurrentUser =
                    `${userRow.username}-${userRow.idpId}` ===
                    `${user?.username}-${user?.idpId}`;
                const isDisabled = userRow.isOwner || isCurrentUser;
                return (
                    <div className="flex items-center justify-end">
                        <div>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        className="h-8 w-8 p-0"
                                        disabled={isDisabled}
                                    >
                                        <span className="sr-only">
                                            {t("openMenu")}
                                        </span>
                                        <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <Link
                                        href={`/${org?.org.orgId}/settings/access/users/${userRow.id}`}
                                        className="block w-full"
                                        aria-disabled={isDisabled}
                                        onClick={(e) =>
                                            isDisabled && e.preventDefault()
                                        }
                                    >
                                        <DropdownMenuItem disabled={isDisabled}>
                                            {t("accessUsersManage")}
                                        </DropdownMenuItem>
                                    </Link>
                                    {!isDisabled && (
                                        <DropdownMenuItem
                                            onClick={() => {
                                                setIsDeleteModalOpen(true);
                                                setSelectedUser(userRow);
                                            }}
                                        >
                                            <span className="text-red-500">
                                                {t("accessUserRemove")}
                                            </span>
                                        </DropdownMenuItem>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                        {isDisabled ? (
                            <Button
                                variant={"outline"}
                                className="ml-2"
                                disabled
                            >
                                {t("manage")}
                                <ArrowRight className="ml-2 w-4 h-4" />
                            </Button>
                        ) : (
                            <Link
                                href={`/${org?.org.orgId}/settings/access/users/${userRow.id}`}
                            >
                                <Button variant={"outline"} className="ml-2">
                                    {t("manage")}
                                    <ArrowRight className="ml-2 w-4 h-4" />
                                </Button>
                            </Link>
                        )}
                    </div>
                );
            }
        }
    ];

    async function removeUser() {
        if (selectedUser) {
            const res = await api
                .delete(`/org/${org!.org.orgId}/user/${selectedUser.id}`)
                .catch((e) => {
                    toast({
                        variant: "destructive",
                        title: t("userErrorOrgRemove"),
                        description: formatAxiosError(
                            e,
                            t("userErrorOrgRemoveDescription")
                        )
                    });
                });

            if (res && res.status === 200) {
                toast({
                    variant: "default",
                    title: t("userOrgRemoved"),
                    description: t("userOrgRemovedDescription", {
                        email: selectedUser.email || ""
                    })
                });
            }
        }
        router.refresh();
        setIsDeleteModalOpen(false);
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
            <ConfirmDeleteDialog
                open={isDeleteModalOpen}
                setOpen={(val) => {
                    setIsDeleteModalOpen(val);
                    setSelectedUser(null);
                }}
                dialog={
                    <div className="space-y-2">
                        <p>{t("userQuestionOrgRemove")}</p>
                        <p>{t("userMessageOrgRemove")}</p>
                    </div>
                }
                buttonText={t("userRemoveOrgConfirm")}
                onConfirm={async () => startTransition(removeUser)}
                string={
                    selectedUser
                        ? getUserDisplayName({
                              email: selectedUser.email,
                              name: selectedUser.name,
                              username: selectedUser.username
                          })
                        : ""
                }
                title={t("userRemoveOrg")}
            />

            <ControlledDataTable
                columns={columns}
                pagination={pagination}
                rowCount={rowCount}
                isNavigatingToAddPage={isNavigatingToAddPage}
                searchQuery={searchParams.get("query")?.toString()}
                onSearch={handleSearchChange}
                onPaginationChange={handlePaginationChange}
                rows={users}
                searchPlaceholder={t("accessUsersSearch")}
                tableId="users-table"
                onAdd={() => {
                    startNavigation(() =>
                        router.push(
                            `/${org?.org.orgId}/settings/access/users/create`
                        )
                    );
                }}
                onRefresh={refreshData}
                isRefreshing={isRefreshing || isFiltering}
            />
        </>
    );
}
