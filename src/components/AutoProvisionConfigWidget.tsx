"use client";

import IdpAutoProvisionUsersDescription from "@app/components/IdpAutoProvisionUsersDescription";
import { FormDescription } from "@app/components/ui/form";
import { SwitchInput } from "@app/components/SwitchInput";
import { useTranslations } from "next-intl";
import { usePaidStatus } from "@app/hooks/usePaidStatus";
import { tierMatrix } from "@server/lib/billing/tierMatrix";
import { MappingBuilderRule, RoleMappingMode } from "@app/lib/idpRoleMapping";
import RoleMappingConfigFields from "@app/components/RoleMappingConfigFields";

type Role = {
    roleId: number;
    name: string;
};

type AutoProvisionConfigWidgetProps = {
    autoProvision: boolean;
    onAutoProvisionChange: (checked: boolean) => void;
    roleMappingMode: RoleMappingMode;
    onRoleMappingModeChange: (mode: RoleMappingMode) => void;
    roles: Role[];
    fixedRoleNames: string[];
    onFixedRoleNamesChange: (roleNames: string[]) => void;
    mappingBuilderClaimPath: string;
    onMappingBuilderClaimPathChange: (claimPath: string) => void;
    mappingBuilderRules: MappingBuilderRule[];
    onMappingBuilderRulesChange: (rules: MappingBuilderRule[]) => void;
    rawExpression: string;
    onRawExpressionChange: (expression: string) => void;
};

export default function AutoProvisionConfigWidget({
    autoProvision,
    onAutoProvisionChange,
    roleMappingMode,
    onRoleMappingModeChange,
    roles,
    fixedRoleNames,
    onFixedRoleNamesChange,
    mappingBuilderClaimPath,
    onMappingBuilderClaimPathChange,
    mappingBuilderRules,
    onMappingBuilderRulesChange,
    rawExpression,
    onRawExpressionChange
}: AutoProvisionConfigWidgetProps) {
    const t = useTranslations();
    const { isPaidUser } = usePaidStatus();

    return (
        <div className="space-y-4">
            <div className="mb-4">
                <SwitchInput
                    id="auto-provision-toggle"
                    label={t("idpAutoProvisionUsers")}
                    defaultChecked={autoProvision}
                    onCheckedChange={onAutoProvisionChange}
                    disabled={!isPaidUser(tierMatrix.autoProvisioning)}
                />
            </div>

            {autoProvision && (
                <RoleMappingConfigFields
                    fieldIdPrefix="org-idp-auto-provision"
                    showFreeformRoleNamesHint={false}
                    roleMappingMode={roleMappingMode}
                    onRoleMappingModeChange={onRoleMappingModeChange}
                    roles={roles}
                    fixedRoleNames={fixedRoleNames}
                    onFixedRoleNamesChange={onFixedRoleNamesChange}
                    mappingBuilderClaimPath={mappingBuilderClaimPath}
                    onMappingBuilderClaimPathChange={
                        onMappingBuilderClaimPathChange
                    }
                    mappingBuilderRules={mappingBuilderRules}
                    onMappingBuilderRulesChange={onMappingBuilderRulesChange}
                    rawExpression={rawExpression}
                    onRawExpressionChange={onRawExpressionChange}
                />
            )}
        </div>
    );
}
