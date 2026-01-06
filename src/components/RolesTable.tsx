"use client";

import CreateRoleForm from "@app/components/CreateRoleForm";
import DeleteRoleForm from "@app/components/DeleteRoleForm";
import { RolesDataTable } from "@app/components/RolesDataTable";
import { Button } from "@app/components/ui/button";
import { ExtendedColumnDef } from "@app/components/ui/data-table";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useOrgContext } from "@app/hooks/useOrgContext";
import { toast } from "@app/hooks/useToast";
import { createApiClient } from "@app/lib/api";
import { Role } from "@server/db";
import { ArrowUpDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Switch } from "./ui/switch";
import { usePaidStatus } from "@app/hooks/usePaidStatus";

export type RoleRow = Role;

type RolesTableProps = {
    roles: RoleRow[];
};

export default function UsersTable({ roles: r }: RolesTableProps) {
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const router = useRouter();

    const [roles, setRoles] = useState<RoleRow[]>(r);

    const [roleToRemove, setUserToRemove] = useState<RoleRow | null>(null);

    const api = createApiClient(useEnvContext());

    const { org } = useOrgContext();
    const { isPaidUser } = usePaidStatus();

    const t = useTranslations();
    const [isRefreshing, setIsRefreshing] = useState(false);

    const refreshData = async () => {
        console.log("Data refreshed");
        setIsRefreshing(true);
        try {
            await new Promise((resolve) => setTimeout(resolve, 200));
            router.refresh();
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

        ...(isPaidUser
            ? ([
                  {
                      accessorKey: "requireDeviceApproval",
                      friendlyName: t("requireDeviceApproval"),
                      header: () => (
                          <span className="p-3">
                              {t("requireDeviceApproval")}
                          </span>
                      ),
                      cell: ({ row }) => (
                          <Switch
                              defaultChecked={
                                  !!row.original.requireDeviceApproval
                              }
                              disabled={!!row.original.isAdmin}
                              onCheckedChange={(val) => {
                                  // ...
                              }}
                          />
                      )
                  }
              ] as ExtendedColumnDef<RoleRow>[])
            : []),

        {
            id: "actions",
            enableHiding: false,
            header: () => <span className="p-3"></span>,
            cell: ({ row }) => {
                const roleRow = row.original;

                return (
                    <div className="flex items-center gap-2 justify-end">
                        <Button
                            variant={"outline"}
                            disabled={roleRow.isAdmin || false}
                            onClick={() => {
                                setIsDeleteModalOpen(true);
                                setUserToRemove(roleRow);
                            }}
                        >
                            {t("accessRoleDelete")}
                        </Button>
                    </div>
                );
            }
        }
    ];

    return (
        <>
            <CreateRoleForm
                open={isCreateModalOpen}
                setOpen={setIsCreateModalOpen}
                afterCreate={async (role) => {
                    setRoles((prev) => [...prev, role]);
                }}
            />

            {roleToRemove && (
                <DeleteRoleForm
                    open={isDeleteModalOpen}
                    setOpen={setIsDeleteModalOpen}
                    roleToDelete={roleToRemove}
                    afterDelete={() => {
                        setRoles((prev) =>
                            prev.filter((r) => r.roleId !== roleToRemove.roleId)
                        );
                        setUserToRemove(null);
                    }}
                />
            )}

            <RolesDataTable
                columns={columns}
                data={roles}
                createRole={() => {
                    setIsCreateModalOpen(true);
                }}
                onRefresh={refreshData}
                isRefreshing={isRefreshing}
            />
        </>
    );
}
