import { orgQueries } from "@app/lib/queries";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useDebounce } from "use-debounce";

import { useTranslations } from "next-intl";
import { MultiSelectTagInput } from "./multi-select/multi-select-tag-input";

export type SelectedRole = { id: string; text: string };

export type RolesSelectorProps = {
    orgId: string;
    selectedRoles?: SelectedRole[];
    onSelectRoles: (roles: SelectedRole[]) => void;
    disabled?: boolean;
    restrictAdminRole?: boolean;
};

export function RolesSelector({
    orgId,
    selectedRoles = [],
    onSelectRoles,
    disabled,
    restrictAdminRole
}: RolesSelectorProps) {
    const t = useTranslations();
    const [roleSearchQuery, setRoleSearchQuery] = useState("");

    const [debouncedValue] = useDebounce(roleSearchQuery, 150);

    const { data: roles = [] } = useQuery(
        orgQueries.roles({ orgId, perPage: 7, query: debouncedValue })
    );

    // always include the selected roles in the list (if the user isn't searching)
    const rolesShown = useMemo(() => {
        let allRoles: Array<SelectedRole & { isAdmin?: boolean }> = roles.map(
            (r) => ({
                id: r.roleId.toString(),
                text: r.name,
                isAdmin: Boolean(r.isAdmin)
            })
        );

        if (debouncedValue.trim().length === 0) {
            for (const role of selectedRoles) {
                if (!allRoles.find((r) => r.id === role.id)) {
                    allRoles.unshift(role);
                }
            }
        }

        if (restrictAdminRole) {
            allRoles = allRoles.filter((role) => !role.isAdmin);
        }

        return allRoles;
    }, [roles, selectedRoles, debouncedValue, restrictAdminRole]);

    return (
        <MultiSelectTagInput
            buttonText={t("alertingSelectRoles")}
            searchQuery={roleSearchQuery}
            onSearch={setRoleSearchQuery}
            options={rolesShown}
            value={selectedRoles}
            onChange={onSelectRoles}
            disabled={disabled}
        />
    );
}
