"use client";

import CreateRoleForm from "@app/components/CreateRoleForm";
import DeleteRoleForm from "@app/components/DeleteRoleForm";
import { RolesDataTable } from "@app/components/RolesDataTable";
import { Button } from "@app/components/ui/button";
import { ExtendedColumnDef } from "@app/components/ui/data-table";
import { toast } from "@app/hooks/useToast";
import { Role } from "@server/db";
import { ArrowUpDown, MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem
} from "./ui/dropdown-menu";
import EditRoleForm from "./EditRoleForm";

export type RoleRow = Role;

type RolesTableProps = {
    roles: RoleRow[];
};

export default function UsersTable({ roles }: RolesTableProps) {
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [editingRole, setEditingRole] = useState<RoleRow | null>(null);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const router = useRouter();

    const [roleToRemove, setRoleToRemove] = useState<RoleRow | null>(null);

    const t = useTranslations();
    const [isRefreshing, startTransition] = useTransition();

    const refreshData = async () => {
        console.log("Data refreshed");
        try {
            router.refresh();
        } catch (error) {
            toast({
                title: t("error"),
                description: t("refreshError"),
                variant: "destructive"
            });
        }
    };

    const columns: ExtendedColumnDef<RoleRow>[] = [
        {
            accessorKey: "name",
            enableHiding: false,
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
            accessorKey: "description",
            friendlyName: t("description"),
            header: () => <span className="p-3">{t("description")}</span>
        },
        // {
        //     id: "actions",
        //     enableHiding: false,
        //     header: () => <span className="p-3"></span>,
        //     cell: ({ row }) => {
        //         const roleRow = row.original;

        //         return (
        //             <div className="flex items-center gap-2 justify-end">
        //                 <Button
        //                     variant={"outline"}
        //                     disabled={roleRow.isAdmin || false}
        //                     onClick={() => {
        //                         setIsDeleteModalOpen(true);
        //                         setUserToRemove(roleRow);
        //                     }}
        //                 >
        //                     {t("accessRoleDelete")}
        //                 </Button>
        //             </div>
        //         );
        //     }
        // },
        {
            id: "actions",
            enableHiding: false,
            header: () => <span className="p-3"></span>,
            cell: ({ row }) => {
                const roleRow = row.original;
                return (
                    !roleRow.isAdmin && (
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
                                            setRoleToRemove(roleRow);
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
                                    setEditingRole(roleRow);
                                    setIsEditDialogOpen(true);
                                }}
                            >
                                {t("edit")}
                            </Button>
                        </div>
                    )
                );
            }
        }
    ];

    return (
        <>
            {editingRole && (
                <EditRoleForm
                    role={editingRole}
                    open={isEditDialogOpen}
                    key={editingRole.roleId}
                    setOpen={setIsEditDialogOpen}
                    onSuccess={() => {
                        // Delay refresh to allow modal to close smoothly
                        setTimeout(() => {
                            startTransition(async () => {
                                await refreshData().then(() =>
                                    setEditingRole(null)
                                );
                            });
                        }, 150);
                    }}
                />
            )}
            <CreateRoleForm
                open={isCreateModalOpen}
                setOpen={setIsCreateModalOpen}
                afterCreate={() => {
                    startTransition(refreshData);
                }}
            />

            {roleToRemove && (
                <DeleteRoleForm
                    open={isDeleteModalOpen}
                    setOpen={setIsDeleteModalOpen}
                    roleToDelete={roleToRemove}
                    afterDelete={() => {
                        startTransition(async () => {
                            await refreshData().then(() =>
                                setRoleToRemove(null)
                            );
                        });
                    }}
                />
            )}

            <RolesDataTable
                columns={columns}
                data={roles}
                createRole={() => {
                    setIsCreateModalOpen(true);
                }}
                onRefresh={() => startTransition(refreshData)}
                isRefreshing={isRefreshing}
            />
        </>
    );
}
