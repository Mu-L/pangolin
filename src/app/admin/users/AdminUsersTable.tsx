"use client";

import { UsersDataTable } from "@app/components/AdminUsersDataTable";
import { Button } from "@app/components/ui/button";
import { ArrowRight, ArrowUpDown, MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import ConfirmDeleteDialog from "@app/components/ConfirmDeleteDialog";
import { toast } from "@app/hooks/useToast";
import { formatAxiosError } from "@app/lib/api";
import { createApiClient } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useTranslations } from "next-intl";
import {
    DropdownMenu,
    DropdownMenuItem,
    DropdownMenuContent,
    DropdownMenuTrigger
} from "@app/components/ui/dropdown-menu";
import { ExtendedColumnDef } from "@app/components/ui/data-table";

export type GlobalUserRow = {
    id: string;
    name: string | null;
    username: string;
    email: string | null;
    type: string;
    idpId: number | null;
    idpName: string;
    dateCreated: string;
    twoFactorEnabled: boolean | null;
    twoFactorSetupRequested: boolean | null;
};

type Props = {
    users: GlobalUserRow[];
};

export default function UsersTable({ users }: Props) {
    const router = useRouter();
    const t = useTranslations();

    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [selected, setSelected] = useState<GlobalUserRow | null>(null);
    const [rows, setRows] = useState<GlobalUserRow[]>(users);

    const api = createApiClient(useEnvContext());

    const deleteUser = (id: string) => {
        api.delete(`/user/${id}`)
            .catch((e) => {
                console.error(t("userErrorDelete"), e);
                toast({
                    variant: "destructive",
                    title: t("userErrorDelete"),
                    description: formatAxiosError(e, t("userErrorDelete"))
                });
            })
            .then(() => {
                router.refresh();
                setIsDeleteModalOpen(false);

                const newRows = rows.filter((row) => row.id !== id);

                setRows(newRows);
            });
    };

    const columns: ExtendedColumnDef<GlobalUserRow>[] = [
        {
            accessorKey: "id",
            friendlyName: "ID",
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                        onClick={() =>
                            column.toggleSorting(column.getIsSorted() === "asc")
                        }
                    >
                        ID
                    </Button>
                );
            }
        },
        {
            accessorKey: "username",
            friendlyName: t("username"),
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                        onClick={() =>
                            column.toggleSorting(column.getIsSorted() === "asc")
                        }
                    >
                        {t("username")}
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                );
            }
        },
        {
            accessorKey: "email",
            friendlyName: t("email"),
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                        onClick={() =>
                            column.toggleSorting(column.getIsSorted() === "asc")
                        }
                    >
                        {t("email")}
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                );
            }
        },
        {
            accessorKey: "name",
            friendlyName: t("name"),
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                        onClick={() =>
                            column.toggleSorting(column.getIsSorted() === "asc")
                        }
                    >
                        {t("name")}
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                );
            }
        },
        {
            accessorKey: "idpName",
            friendlyName: t("identityProvider"),
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                        onClick={() =>
                            column.toggleSorting(column.getIsSorted() === "asc")
                        }
                    >
                        {t("identityProvider")}
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                );
            }
        },
        {
            accessorKey: "twoFactorEnabled",
            friendlyName: t("twoFactor"),
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                        onClick={() =>
                            column.toggleSorting(column.getIsSorted() === "asc")
                        }
                    >
                        {t("twoFactor")}
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                );
            },
            cell: ({ row }) => {
                const userRow = row.original;

                return (
                    <div className="flex flex-row items-center gap-2">
                        <span>
                            {userRow.twoFactorEnabled ||
                            userRow.twoFactorSetupRequested ? (
                                <span className="text-green-500">
                                    {t("enabled")}
                                </span>
                            ) : (
                                <span>{t("disabled")}</span>
                            )}
                        </span>
                    </div>
                );
            }
        },
        {
            id: "actions",
            header: () => <span className="p-3">{t("actions")}</span>,
            cell: ({ row }) => {
                const r = row.original;
                return (
                    <>
                        <div className="flex items-center gap-2">
                            <Button
                                variant={"outline"}
                                onClick={() => {
                                    router.push(`/admin/users/${r.id}`);
                                }}
                            >
                                {t("edit")}
                                <ArrowRight className="ml-2 w-4 h-4" />
                            </Button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        className="h-8 w-8 p-0"
                                    >
                                        <span className="sr-only">
                                            Open menu
                                        </span>
                                        <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                        onClick={() => {
                                            setSelected(r);
                                            setIsDeleteModalOpen(true);
                                        }}
                                    >
                                        {t("delete")}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </>
                );
            }
        }
    ];

    return (
        <>
            {selected && (
                <ConfirmDeleteDialog
                    open={isDeleteModalOpen}
                    setOpen={(val) => {
                        setIsDeleteModalOpen(val);
                        setSelected(null);
                    }}
                    dialog={
                        <div className="space-y-2">
                            <p>{t("userQuestionRemove")}</p>

                            <p>{t("userMessageRemove")}</p>
                        </div>
                    }
                    buttonText={t("userDeleteConfirm")}
                    onConfirm={async () => deleteUser(selected!.id)}
                    string={
                        selected.email || selected.name || selected.username
                    }
                    title={t("userDeleteServer")}
                />
            )}

            <UsersDataTable columns={columns} data={rows} />
        </>
    );
}
