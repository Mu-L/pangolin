"use client";

import {
    SettingsFormCell,
    SettingsFormGrid,
    SettingsSection,
    SettingsSectionBody,
    SettingsSectionDescription,
    SettingsSectionHeader,
    SettingsSubsectionDescription,
    SettingsSubsectionHeader,
    SettingsSubsectionTitle,
    SettingsSectionTitle
} from "@app/components/Settings";
import { TagInput } from "@app/components/tags/tag-input";
import { FormField } from "@app/components/ui/form";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { type UseFormReturn, useWatch } from "react-hook-form";
import type { PolicyFormValues } from ".";
import {
    EmailCredenza,
    HeaderAuthCredenza,
    PasscodeCredenza,
    PincodeCredenza
} from "./PolicyAuthMethodCredenzas";
import { PolicyAuthMethodRow } from "./PolicyAuthMethodRow";
import { PolicyAuthSsoSection } from "./PolicyAuthSsoSection";
import type { PolicyAuthMethodId } from "./policy-auth-method-id";
import {
    getEmailWhitelistSummary,
    getHeaderAuthSummary,
    getPasscodeSummary,
    getPincodeSummary
} from "./policy-auth-summaries";

export type PolicyAuthStackSectionCreateProps = {
    form: UseFormReturn<PolicyFormValues, any, any>;
    orgId: string;
    allIdps: { id: number; text: string }[];
    allRoles: { id: string; text: string }[];
    allUsers: { id: string; text: string }[];
    emailEnabled: boolean;
};

export function PolicyAuthStackSectionCreate({
    form: parentForm,
    allIdps,
    allRoles,
    allUsers,
    emailEnabled
}: PolicyAuthStackSectionCreateProps) {
    const t = useTranslations();
    const [editingMethod, setEditingMethod] =
        useState<PolicyAuthMethodId | null>(null);
    const [activeRolesTagIndex, setActiveRolesTagIndex] = useState<
        number | null
    >(null);
    const [activeUsersTagIndex, setActiveUsersTagIndex] = useState<
        number | null
    >(null);

    const sso = useWatch({ control: parentForm.control, name: "sso" });
    const skipToIdpId = useWatch({
        control: parentForm.control,
        name: "skipToIdpId"
    });
    const password = useWatch({
        control: parentForm.control,
        name: "password"
    });
    const pincode = useWatch({ control: parentForm.control, name: "pincode" });
    const headerAuth = useWatch({
        control: parentForm.control,
        name: "headerAuth"
    });
    const emailWhitelistEnabled = useWatch({
        control: parentForm.control,
        name: "emailWhitelistEnabled"
    });
    const emails =
        useWatch({ control: parentForm.control, name: "emails" }) ?? [];

    const passcodeActive = Boolean(password);
    const pinActive = Boolean(pincode);
    const headerAuthActive = Boolean(headerAuth);

    const closeCredenza = () => setEditingMethod(null);

    const handleToggle = (
        method: PolicyAuthMethodId,
        active: boolean,
        onDisable: () => void,
        onEnable?: () => void
    ) => {
        if (active) {
            onEnable?.();
            setEditingMethod(method);
            return;
        }
        onDisable();
        setEditingMethod((current) => (current === method ? null : current));
    };

    return (
        <SettingsSection>
            <SettingsSectionHeader>
                <SettingsSectionTitle>
                    {t("policyAuthStackTitle")}
                </SettingsSectionTitle>
                <SettingsSectionDescription>
                    {t("policyAuthStackDescription")}
                </SettingsSectionDescription>
            </SettingsSectionHeader>
            <SettingsSectionBody>
                <SettingsFormGrid>
                    <SettingsFormCell span="half">
                        <PolicyAuthSsoSection
                            sso={Boolean(sso)}
                            onSsoChange={(active) =>
                                parentForm.setValue("sso", active)
                            }
                            skipToIdpId={skipToIdpId}
                            onSkipToIdpChange={(id) =>
                                parentForm.setValue("skipToIdpId", id)
                            }
                            allIdps={allIdps}
                            rolesEditor={
                                <FormField<PolicyFormValues, "roles">
                                    control={parentForm.control}
                                    name="roles"
                                    render={({ field }) => (
                                        <TagInput
                                            {...field}
                                            activeTagIndex={activeRolesTagIndex}
                                            setActiveTagIndex={
                                                setActiveRolesTagIndex
                                            }
                                            placeholder={t("accessRoleSelect2")}
                                            tags={field.value ?? []}
                                            setTags={(newRoles) =>
                                                field.onChange(newRoles)
                                            }
                                            autocompleteOptions={allRoles}
                                            allowDuplicates={false}
                                            size="sm"
                                        />
                                    )}
                                />
                            }
                            usersEditor={
                                <FormField<PolicyFormValues, "users">
                                    control={parentForm.control}
                                    name="users"
                                    render={({ field }) => (
                                        <TagInput
                                            {...field}
                                            activeTagIndex={activeUsersTagIndex}
                                            setActiveTagIndex={
                                                setActiveUsersTagIndex
                                            }
                                            placeholder={t("accessUserSelect")}
                                            tags={field.value ?? []}
                                            setTags={(newUsers) =>
                                                field.onChange(newUsers)
                                            }
                                            autocompleteOptions={allUsers}
                                            allowDuplicates={false}
                                            size="sm"
                                        />
                                    )}
                                />
                            }
                        />
                    </SettingsFormCell>
                </SettingsFormGrid>

                <SettingsSubsectionHeader>
                    <SettingsSubsectionTitle>
                        {t("policyAuthOtherMethodsTitle")}
                    </SettingsSubsectionTitle>
                    <SettingsSubsectionDescription>
                        {t("policyAuthOtherMethodsDescription")}
                    </SettingsSubsectionDescription>
                </SettingsSubsectionHeader>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <PolicyAuthMethodRow
                        id="pincode"
                        title={t("policyAuthPincodeTitle")}
                        description={t("policyAuthPincodeDescription")}
                        summary={getPincodeSummary({ t })}
                        active={pinActive}
                        onConfigure={() => setEditingMethod("pincode")}
                        onToggle={(active) =>
                            handleToggle("pincode", active, () =>
                                parentForm.setValue("pincode", null)
                            )
                        }
                    />

                    <PolicyAuthMethodRow
                        id="passcode"
                        title={t("policyAuthPasscodeTitle")}
                        description={t("policyAuthPasscodeDescription")}
                        summary={getPasscodeSummary({ t })}
                        active={passcodeActive}
                        onConfigure={() => setEditingMethod("passcode")}
                        onToggle={(active) =>
                            handleToggle("passcode", active, () =>
                                parentForm.setValue("password", null)
                            )
                        }
                    />

                    <PolicyAuthMethodRow
                        id="email"
                        title={t("policyAuthEmailTitle")}
                        description={t("policyAuthEmailDescription")}
                        summary={getEmailWhitelistSummary({
                            t,
                            count: emails.length
                        })}
                        active={Boolean(emailWhitelistEnabled)}
                        onConfigure={() => setEditingMethod("email")}
                        onToggle={(active) =>
                            handleToggle(
                                "email",
                                active,
                                () =>
                                    parentForm.setValue(
                                        "emailWhitelistEnabled",
                                        false
                                    ),
                                () =>
                                    parentForm.setValue(
                                        "emailWhitelistEnabled",
                                        true
                                    )
                            )
                        }
                        disabled={!emailEnabled}
                    />

                    <PolicyAuthMethodRow
                        id="header-auth"
                        title={t("policyAuthHeaderAuthTitle")}
                        description={t("policyAuthHeaderAuthDescription")}
                        summary={getHeaderAuthSummary({
                            t,
                            headerName: headerAuth?.user ?? ""
                        })}
                        active={headerAuthActive}
                        onConfigure={() => setEditingMethod("headerAuth")}
                        onToggle={(active) =>
                            handleToggle("headerAuth", active, () =>
                                parentForm.setValue("headerAuth", null)
                            )
                        }
                    />
                </div>

                <PincodeCredenza
                    open={editingMethod === "pincode"}
                    onOpenChange={(open) => !open && closeCredenza()}
                    defaultPincode={pincode?.pincode ?? ""}
                    onSave={(value) => {
                        parentForm.setValue("pincode", { pincode: value });
                    }}
                />

                <PasscodeCredenza
                    open={editingMethod === "passcode"}
                    onOpenChange={(open) => !open && closeCredenza()}
                    defaultPassword={password?.password ?? ""}
                    onSave={(value) => {
                        parentForm.setValue("password", { password: value });
                    }}
                />

                <EmailCredenza
                    open={editingMethod === "email"}
                    onOpenChange={(open) => !open && closeCredenza()}
                    emailEnabled={emailEnabled}
                    emails={emails}
                    onSave={(value) =>
                        parentForm.setValue(
                            "emails",
                            value as PolicyFormValues["emails"]
                        )
                    }
                />

                <HeaderAuthCredenza
                    open={editingMethod === "headerAuth"}
                    onOpenChange={(open) => !open && closeCredenza()}
                    defaultValues={
                        headerAuth
                            ? {
                                  user: headerAuth.user,
                                  password: headerAuth.password,
                                  extendedCompatibility:
                                      headerAuth.extendedCompatibility
                              }
                            : undefined
                    }
                    onSave={(value) => {
                        parentForm.setValue("headerAuth", value);
                    }}
                />
            </SettingsSectionBody>
        </SettingsSection>
    );
}
