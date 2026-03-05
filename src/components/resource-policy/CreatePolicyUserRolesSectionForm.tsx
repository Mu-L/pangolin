"use client";

import {
    SettingsSection,
    SettingsSectionBody,
    SettingsSectionDescription,
    SettingsSectionForm,
    SettingsSectionHeader,
    SettingsSectionTitle
} from "@app/components/Settings";

import { SwitchInput } from "@app/components/SwitchInput";
import { Tag, TagInput } from "@app/components/tags/tag-input";
import {
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@app/components/ui/form";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@app/components/ui/select";
import { type PolicyFormValues } from ".";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { type UseFormReturn, useWatch } from "react-hook-form";

// ─── CreatePolicyUsersRolesSectionForm ────────────────────────────────────────

export type CreatePolicyUsersRolesSectionFormProps = {
    form: UseFormReturn<PolicyFormValues, any, any>;
    allRoles: { id: string; text: string }[];
    allUsers: { id: string; text: string }[];
    allIdps: { id: number; text: string }[];
};

export function CreatePolicyUsersRolesSectionForm({
    form,
    allRoles,
    allUsers,
    allIdps
}: CreatePolicyUsersRolesSectionFormProps) {
    const t = useTranslations();
    const ssoEnabled = useWatch({ control: form.control, name: "sso" });
    const selectedIdpId = useWatch({
        control: form.control,
        name: "skipToIdpId"
    });
    const [activeRolesTagIndex, setActiveRolesTagIndex] = useState<
        number | null
    >(null);
    const [activeUsersTagIndex, setActiveUsersTagIndex] = useState<
        number | null
    >(null);

    return (
        <SettingsSection>
            <SettingsSectionHeader>
                <SettingsSectionTitle>
                    {t("resourceUsersRoles")}
                </SettingsSectionTitle>
                <SettingsSectionDescription>
                    {t("resourcePolicyUsersRolesDescription")}
                </SettingsSectionDescription>
            </SettingsSectionHeader>
            <SettingsSectionBody>
                <SettingsSectionForm>
                    <SwitchInput
                        id="sso-toggle"
                        label={t("ssoUse")}
                        defaultChecked={ssoEnabled}
                        onCheckedChange={(val) => {
                            console.log(`form.setValue("sso", ${val})`);
                            form.setValue("sso", val);
                        }}
                    />

                    {ssoEnabled && (
                        <>
                            <FormField
                                control={form.control}
                                name="roles"
                                render={({ field }) => (
                                    <FormItem className="flex flex-col items-start">
                                        <FormLabel>{t("roles")}</FormLabel>
                                        <FormControl>
                                            <TagInput
                                                {...field}
                                                activeTagIndex={
                                                    activeRolesTagIndex
                                                }
                                                setActiveTagIndex={
                                                    setActiveRolesTagIndex
                                                }
                                                placeholder={t(
                                                    "accessRoleSelect2"
                                                )}
                                                size="sm"
                                                tags={form.getValues().roles}
                                                setTags={(newRoles) => {
                                                    form.setValue(
                                                        "roles",
                                                        newRoles as [
                                                            Tag,
                                                            ...Tag[]
                                                        ]
                                                    );
                                                }}
                                                enableAutocomplete={true}
                                                autocompleteOptions={allRoles}
                                                allowDuplicates={false}
                                                restrictTagsToAutocompleteOptions={
                                                    true
                                                }
                                                sortTags={true}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                        <FormDescription>
                                            {t("resourceRoleDescription")}
                                        </FormDescription>
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="users"
                                render={({ field }) => (
                                    <FormItem className="flex flex-col items-start">
                                        <FormLabel>{t("users")}</FormLabel>
                                        <FormControl>
                                            <TagInput
                                                {...field}
                                                activeTagIndex={
                                                    activeUsersTagIndex
                                                }
                                                setActiveTagIndex={
                                                    setActiveUsersTagIndex
                                                }
                                                placeholder={t(
                                                    "accessUserSelect"
                                                )}
                                                size="sm"
                                                tags={form.getValues().users}
                                                setTags={(newUsers) => {
                                                    form.setValue(
                                                        "users",
                                                        newUsers as [
                                                            Tag,
                                                            ...Tag[]
                                                        ]
                                                    );
                                                }}
                                                enableAutocomplete={true}
                                                autocompleteOptions={allUsers}
                                                allowDuplicates={false}
                                                restrictTagsToAutocompleteOptions={
                                                    true
                                                }
                                                sortTags={true}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </>
                    )}

                    {ssoEnabled && allIdps.length > 0 && (
                        <div className="space-y-2">
                            <label className="text-sm font-medium">
                                {t("defaultIdentityProvider")}
                            </label>
                            <Select
                                onValueChange={(value) => {
                                    if (value === "none") {
                                        form.setValue("skipToIdpId", null);
                                    } else {
                                        const id = parseInt(value);
                                        form.setValue("skipToIdpId", id);
                                    }
                                }}
                                value={
                                    selectedIdpId
                                        ? selectedIdpId.toString()
                                        : "none"
                                }
                            >
                                <SelectTrigger className="w-full mt-1">
                                    <SelectValue
                                        placeholder={t("selectIdpPlaceholder")}
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
                                {t("defaultIdentityProviderDescription")}
                            </p>
                        </div>
                    )}
                </SettingsSectionForm>
            </SettingsSectionBody>
        </SettingsSection>
    );
}
