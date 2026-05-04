"use client";

import { SettingsContainer } from "@app/components/Settings";

import { useEnvContext } from "@app/hooks/useEnvContext";
import { useOrgContext } from "@app/hooks/useOrgContext";
import { usePaidStatus } from "@app/hooks/usePaidStatus";

import { getUserDisplayName } from "@app/lib/getUserDisplayName";
import { orgQueries } from "@app/lib/queries";
import { build } from "@server/build";
import { tierMatrix } from "@server/lib/billing/tierMatrix";
import { UserType } from "@server/types/UserTypes";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { createApiClient } from "@app/lib/api";
import { useRouter } from "next/navigation";

import { useMemo } from "react";
import { EditPolicyAuthMethodsSectionForm } from "./EditPolicyAuthMethodsSectionForm";
import { EditPolicyNameSectionForm } from "./EditPolicyNameSectionForm";
import { EditPolicyUsersRolesSectionForm } from "./EditPolicyUserRolesSectionForm";
import { EditPolicyOtpEmailSectionForm } from "./EditPolicyOtpEmailSectionForm";
import { EditPolicyRulesSectionForm } from "./EditPolicyRulesSectionForm";

// ─── EditPolicyForm ─────────────────────────────────────────────────────────

export type EditPolicyFormProps = {
    hidePolicyNameForm?: boolean;
    readonly?: boolean;
};

export function EditPolicyForm({
    hidePolicyNameForm,
    readonly
}: EditPolicyFormProps) {
    const { org } = useOrgContext();
    const t = useTranslations();
    const { env } = useEnvContext();
    const api = createApiClient({ env });
    // const [, formAction, isSubmitting] = useActionState(onSubmit, null);
    const { isPaidUser } = usePaidStatus();

    const router = useRouter();

    const isMaxmindAvailable = !!(
        env.server.maxmind_db_path && env.server.maxmind_db_path.length > 0
    );
    const isMaxmindASNAvailable = !!(
        env.server.maxmind_asn_path && env.server.maxmind_asn_path.length > 0
    );

    const { data: orgRoles = [], isLoading: isLoadingOrgRoles } = useQuery(
        orgQueries.roles({ orgId: org.org.orgId })
    );
    const { data: orgUsers = [], isLoading: isLoadingOrgUsers } = useQuery(
        orgQueries.users({ orgId: org.org.orgId })
    );
    const { data: orgIdps = [], isLoading: isLoadingOrgIdps } = useQuery(
        orgQueries.identityProviders({
            orgId: org.org.orgId,
            useOrgOnlyIdp: env.app.identityProviderMode === "org"
        })
    );

    const allRoles = useMemo(
        () =>
            orgRoles
                .map((role) => ({
                    id: role.roleId.toString(),
                    text: role.name
                }))
                .filter((role) => role.text !== "Admin"),
        [orgRoles]
    );

    const allUsers = useMemo(
        () =>
            orgUsers.map((user) => ({
                id: user.id.toString(),
                text: `${getUserDisplayName({ email: user.email, username: user.username })}${user.type !== UserType.Internal ? ` (${user.idpName})` : ""}`
            })),
        [orgUsers]
    );

    const allIdps = useMemo(() => {
        if (build === "saas") {
            if (isPaidUser(tierMatrix.orgOidc)) {
                return orgIdps.map((idp) => ({
                    id: idp.idpId,
                    text: idp.name
                }));
            }
        } else {
            return orgIdps.map((idp) => ({ id: idp.idpId, text: idp.name }));
        }
        return [];
    }, [orgIdps, isPaidUser]);

    if (isLoadingOrgRoles || isLoadingOrgUsers || isLoadingOrgIdps) {
        return <></>;
    }

    return (
        <SettingsContainer>
            {!hidePolicyNameForm && <EditPolicyNameSectionForm readonly={readonly} />}

            <EditPolicyUsersRolesSectionForm
                allRoles={allRoles}
                allUsers={allUsers}
                allIdps={allIdps}
                readonly={readonly}
            />

            <EditPolicyAuthMethodsSectionForm readonly={readonly} />

            <EditPolicyOtpEmailSectionForm
                emailEnabled={env.email.emailEnabled}
                readonly={readonly}
            />

            <EditPolicyRulesSectionForm
                isMaxmindAvailable={isMaxmindAvailable}
                isMaxmindAsnAvailable={isMaxmindASNAvailable}
                readonly={readonly}
            />
        </SettingsContainer>
    );
}
