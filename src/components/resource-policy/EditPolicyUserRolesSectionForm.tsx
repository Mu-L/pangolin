"use client";

import {
    SettingsSection,
    SettingsSectionBody,
    SettingsSectionDescription,
    SettingsSectionFooter,
    SettingsSectionForm,
    SettingsSectionHeader,
    SettingsSectionTitle
} from "@app/components/Settings";

import { useEnvContext } from "@app/hooks/useEnvContext";

import { getUserDisplayName } from "@app/lib/getUserDisplayName";
import { zodResolver } from "@hookform/resolvers/zod";
import { UserType } from "@server/types/UserTypes";
import { useTranslations } from "next-intl";

import { toast } from "@app/hooks/useToast";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import type { AxiosResponse } from "axios";
import { useRouter } from "next/navigation";
import { createPolicySchema } from ".";

import { SwitchInput } from "@app/components/SwitchInput";
import { Tag, TagInput } from "@app/components/tags/tag-input";
import { Button } from "@app/components/ui/button";
import {
    Form,
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

import { useResourcePolicyContext } from "@app/providers/ResourcePolicyProvider";
import { useActionState, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

// ─── PolicyUsersRolesSection ──────────────────────────────────────────────────

type PolicyUsersRolesSectionProps = {
    allRoles: { id: string; text: string }[];
    allUsers: { id: string; text: string }[];
    allIdps: { id: number; text: string }[];
    readonly?: boolean;
};

export function EditPolicyUsersRolesSectionForm({
    allRoles,
    allUsers,
    allIdps,
    readonly
}: PolicyUsersRolesSectionProps) {
    const t = useTranslations();

    const router = useRouter();

    const { policy } = useResourcePolicyContext();

    const api = createApiClient(useEnvContext());

    const form = useForm({
        resolver: zodResolver(
            createPolicySchema.pick({
                sso: true,
                skipToIdpId: true,
                users: true,
                roles: true
            })
        ),
        defaultValues: {
            sso: policy.sso,
            skipToIdpId: policy.idpId,
            roles: policy.roles.map((role) => ({
                id: role.roleId.toString(),
                text: role.name
            })),
            users: policy.users.map((user) => ({
                id: user.userId,
                text: `${getUserDisplayName({ email: user.email, username: user.username })}${user.type !== UserType.Internal ? ` (${user.idpName})` : ""}`
            }))
        }
    });

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

    const [, formAction, isSubmitting] = useActionState(onSubmit, null);

    async function onSubmit() {
        if (readonly) return;

        const isValid = await form.trigger();

        if (!isValid) return;

        const payload = form.getValues();

        try {
            const res = await api
                .put<AxiosResponse<{}>>(
                    `/resource-policy/${policy.resourcePolicyId}/access-control`,
                    {
                        sso: payload.sso,
                        userIds: payload.users.map((user) => user.id),
                        roleIds: payload.roles.map((role) => Number(role.id)),
                        skipToIdpId: payload.skipToIdpId
                    }
                )
                .catch((e) => {
                    toast({
                        variant: "destructive",
                        title: t("policyErrorUpdate"),
                        description: formatAxiosError(
                            e,
                            t("policyErrorUpdateDescription")
                        )
                    });
                });

            if (res && res.status === 200) {
                toast({
                    title: t("success"),
                    description: t("policyUpdatedSuccess")
                });
                router.refresh();
            }
        } catch (e) {
            toast({
                variant: "destructive",
                title: t("policyErrorUpdate"),
                description: t("policyErrorUpdateMessageDescription")
            });
        }
    }

    return (
        <Form {...form}>
            <form action={formAction}>
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
                                disabled={readonly}
                            />

                            {ssoEnabled && (
                                <>
                                    <FormField
                                        control={form.control}
                                        name="roles"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-col items-start">
                                                <FormLabel>
                                                    {t("roles")}
                                                </FormLabel>
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
                                                        tags={
                                                            form.getValues()
                                                                .roles
                                                        }
                                                        setTags={(newRoles) => {
                                                            form.setValue(
                                                                "roles",
                                                                newRoles as [
                                                                    Tag,
                                                                    ...Tag[]
                                                                ]
                                                            );
                                                        }}
                                                        enableAutocomplete={
                                                            true
                                                        }
                                                        autocompleteOptions={
                                                            allRoles
                                                        }
                                                        allowDuplicates={false}
                                                        restrictTagsToAutocompleteOptions={
                                                            true
                                                        }
                                                        sortTags={true}
                                                        disabled={readonly}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                                <FormDescription>
                                                    {t(
                                                        "resourceRoleDescription"
                                                    )}
                                                </FormDescription>
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="users"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-col items-start">
                                                <FormLabel>
                                                    {t("users")}
                                                </FormLabel>
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
                                                        tags={
                                                            form.getValues()
                                                                .users
                                                        }
                                                        setTags={(newUsers) => {
                                                            form.setValue(
                                                                "users",
                                                                newUsers as [
                                                                    Tag,
                                                                    ...Tag[]
                                                                ]
                                                            );
                                                        }}
                                                        enableAutocomplete={
                                                            true
                                                        }
                                                        autocompleteOptions={
                                                            allUsers
                                                        }
                                                        allowDuplicates={false}
                                                        restrictTagsToAutocompleteOptions={
                                                            true
                                                        }
                                                        sortTags={true}
                                                        disabled={readonly}
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
                                        disabled={readonly}
                                        onValueChange={(value) => {
                                            if (value === "none") {
                                                form.setValue(
                                                    "skipToIdpId",
                                                    null
                                                );
                                            } else {
                                                const id = parseInt(value);
                                                form.setValue(
                                                    "skipToIdpId",
                                                    id
                                                );
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
                                </div>
                            )}
                        </SettingsSectionForm>
                    </SettingsSectionBody>

                    <SettingsSectionFooter>
                        <Button
                            type="submit"
                            loading={isSubmitting}
                            disabled={readonly || isSubmitting}
                        >
                            {t("resourceUsersRolesSubmit")}
                        </Button>
                    </SettingsSectionFooter>
                </SettingsSection>
            </form>
        </Form>
    );
}
