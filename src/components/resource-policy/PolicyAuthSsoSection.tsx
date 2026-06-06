"use client";

import { SettingsSectionForm } from "@app/components/Settings";
import { SwitchInput } from "@app/components/SwitchInput";
import { Button } from "@app/components/ui/button";
import { FormDescription, FormItem, FormLabel } from "@app/components/ui/form";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@app/components/ui/select";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

export type PolicyAuthSsoSectionProps = {
    sso: boolean;
    onSsoChange: (active: boolean) => void;
    skipToIdpId: number | null | undefined;
    onSkipToIdpChange: (id: number | null) => void;
    allIdps: { id: number; text: string }[];
    rolesEditor: React.ReactNode;
    usersEditor: React.ReactNode;
    disabled?: boolean;
    idpDisabled?: boolean;
};

export function PolicyAuthSsoSection({
    sso,
    onSsoChange,
    skipToIdpId,
    onSkipToIdpChange,
    allIdps,
    rolesEditor,
    usersEditor,
    disabled,
    idpDisabled
}: PolicyAuthSsoSectionProps) {
    const t = useTranslations();
    const [showIdpSelect, setShowIdpSelect] = useState(skipToIdpId != null);

    useEffect(() => {
        if (skipToIdpId != null) {
            setShowIdpSelect(true);
        }
    }, [skipToIdpId]);

    const idpSelectDisabled = idpDisabled ?? disabled;

    return (
        <div className="space-y-4">
            <SwitchInput
                id="policy-auth-sso"
                label={t("policyAuthSsoTitle")}
                description={t("policyAuthSsoDescription")}
                checked={sso}
                disabled={disabled}
                onCheckedChange={onSsoChange}
            />

            {sso && (
                <SettingsSectionForm className="max-w-none space-y-4">
                    <FormItem className="flex flex-col items-start">
                        <FormLabel>{t("roles")}</FormLabel>
                        {rolesEditor}
                    </FormItem>
                    <FormItem className="flex flex-col items-start">
                        <FormLabel>{t("users")}</FormLabel>
                        {usersEditor}
                    </FormItem>
                    {allIdps.length > 0 && (
                        <div className="space-y-2">
                            {skipToIdpId == null && !showIdpSelect ? (
                                <Button
                                    type="button"
                                    variant="text"
                                    size="sm"
                                    className="h-auto px-0"
                                    disabled={idpSelectDisabled}
                                    onClick={() => setShowIdpSelect(true)}
                                >
                                    {t("policyAuthAddDefaultIdentityProvider")}
                                </Button>
                            ) : (
                                <>
                                    <label className="text-sm font-medium">
                                        {t("defaultIdentityProvider")}
                                    </label>
                                    <Select
                                        disabled={idpSelectDisabled}
                                        onValueChange={(value) => {
                                            if (value === "none") {
                                                onSkipToIdpChange(null);
                                                setShowIdpSelect(false);
                                                return;
                                            }
                                            onSkipToIdpChange(parseInt(value));
                                        }}
                                        value={
                                            skipToIdpId
                                                ? skipToIdpId.toString()
                                                : "none"
                                        }
                                    >
                                        <SelectTrigger className="w-full">
                                            <SelectValue
                                                placeholder={t(
                                                    "selectIdpPlaceholder"
                                                )}
                                            />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">
                                                {t("none")}
                                            </SelectItem>
                                            {allIdps.map((idp) => (
                                                <SelectItem
                                                    key={idp.id}
                                                    value={idp.id.toString()}
                                                >
                                                    {idp.text}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-sm text-muted-foreground">
                                        {t(
                                            "defaultIdentityProviderDescription"
                                        )}
                                    </p>
                                </>
                            )}
                        </div>
                    )}
                </SettingsSectionForm>
            )}
        </div>
    );
}
