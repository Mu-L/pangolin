"use client";

import { SettingsContainer } from "@app/components/Settings";

import { useEnvContext } from "@app/hooks/useEnvContext";
import { useOrgContext } from "@app/hooks/useOrgContext";
import { usePaidStatus } from "@app/hooks/usePaidStatus";

import { orgQueries } from "@app/lib/queries";
import { build } from "@server/build";
import { tierMatrix } from "@server/lib/billing/tierMatrix";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { useMemo } from "react";
import { HorizontalTabs } from "@app/components/HorizontalTabs";
import { EditPolicyNameSectionForm } from "./EditPolicyNameSectionForm";
import { PolicyAuthStackSection } from "./PolicyAuthStackSection";
import { PolicyAccessRulesSection } from "./PolicyAccessRulesSection";

export type EditPolicyFormProps = {
    hidePolicyNameForm?: boolean;
    readonly?: boolean;
    resourceId?: number;
};

export function EditPolicyForm({
    hidePolicyNameForm,
    readonly,
    resourceId
}: EditPolicyFormProps) {
    const t = useTranslations();
    const { org } = useOrgContext();
    const { env } = useEnvContext();
    const { isPaidUser } = usePaidStatus();

    // In overlay mode (resourceId provided), policy-level sections are locked.
    // Rules and users/roles sections handle their own hybrid logic via resourceId.
    const isOverlay = resourceId !== undefined;
    const showTabs = !hidePolicyNameForm && !isOverlay;

    const isMaxmindAvailable = !!(
        env.server.maxmind_db_path && env.server.maxmind_db_path.length > 0
    );
    const isMaxmindASNAvailable = !!(
        env.server.maxmind_asn_path && env.server.maxmind_asn_path.length > 0
    );

    const { data: orgIdps = [], isLoading: isLoadingOrgIdps } = useQuery(
        orgQueries.identityProviders({
            orgId: org.org.orgId,
            useOrgOnlyIdp: env.app.identityProviderMode === "org"
        })
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

    if (isLoadingOrgIdps) {
        return <></>;
    }

    const authSection = (
        <PolicyAuthStackSection
            mode="edit"
            orgId={org.org.orgId}
            allIdps={allIdps}
            emailEnabled={env.email.emailEnabled}
            readonly={readonly}
            resourceId={resourceId}
        />
    );

    const rulesSection = (
        <PolicyAccessRulesSection
            mode="edit"
            isMaxmindAvailable={isMaxmindAvailable}
            isMaxmindAsnAvailable={isMaxmindASNAvailable}
            readonly={readonly}
            resourceId={resourceId}
        />
    );

    if (showTabs) {
        return (
            <HorizontalTabs
                clientSide
                defaultTab={0}
                items={[
                    { title: t("general"), href: "#" },
                    { title: t("authentication"), href: "#" },
                    { title: t("policyAccessRulesTitle"), href: "#" }
                ]}
            >
                <EditPolicyNameSectionForm readonly={readonly} />
                {authSection}
                {rulesSection}
            </HorizontalTabs>
        );
    }

    return (
        <SettingsContainer>
            {!hidePolicyNameForm && !isOverlay && (
                <EditPolicyNameSectionForm readonly={readonly} />
            )}

            {authSection}

            {rulesSection}
        </SettingsContainer>
    );
}
