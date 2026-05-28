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

import { RolesSelector } from "@app/components/roles-selector";
import { UsersSelector } from "@app/components/users-selector";
import { SwitchInput } from "@app/components/SwitchInput";
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
import { resourceQueries } from "@app/lib/queries";
import { useQuery } from "@tanstack/react-query";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

// ─── PolicyUsersRolesSection ──────────────────────────────────────────────────

type PolicyUsersRolesSectionProps = {
    orgId: string;
    allIdps: { id: number; text: string }[];
    readonly?: boolean;
    resourceId?: number;
};

export function EditPolicyUsersRolesSectionForm({
    orgId,
    allIdps,
    readonly,
    resourceId
}: PolicyUsersRolesSectionProps) {
    const t = useTranslations();

    const router = useRouter();

    const { policy } = useResourcePolicyContext();

    const api = createApiClient(useEnvContext());

    // ── Resource overlay: fetch resource-specific roles & users ──────────────
    const isResourceOverlay = resourceId !== undefined;

    const { data: resourceRolesData } = useQuery({
        ...resourceQueries.resourceRoles({ resourceId: resourceId! }),
        enabled: isResourceOverlay
    });

    const { data: resourceUsersData } = useQuery({
        ...resourceQueries.resourceUsers({ resourceId: resourceId! }),
        enabled: isResourceOverlay
    });

    // IDs from the policy (locked — cannot be removed)
    const policyRoleLockedIds = useMemo(
        () => new Set(policy.roles.map((r) => r.roleId.toString())),
        [policy.roles]
    );
    const policyUserLockedIds = useMemo(
        () => new Set(policy.users.map((u) => u.userId)),
        [policy.users]
    );

    // Policy entries mapped to selector format
    const policyRoleItems = useMemo(
        () =>
            policy.roles.map((r) => ({
                id: r.roleId.toString(),
                text: r.name
            })),
        [policy.roles]
    );
    const policyUserItems = useMemo(
        () =>
            policy.users.map((u) => ({
                id: u.userId,
                text: `${getUserDisplayName({ email: u.email, username: u.username })}${u.type !== UserType.Internal ? ` (${u.idpName})` : ""}`
            })),
        [policy.users]
    );

    // Track the initial resource-specific roles/users for diffing on save
    const initialResourceRoleIdsRef = useRef<Set<string>>(new Set());
    const initialResourceUserIdsRef = useRef<Set<string>>(new Set());

    // Combined selected roles/users (policy + resource-specific)
    const [combinedRoles, setCombinedRoles] = useState(policyRoleItems);
    const [combinedUsers, setCombinedUsers] = useState(policyUserItems);
    const [resourceRolesInitialized, setResourceRolesInitialized] =
        useState(false);
    const [resourceUsersInitialized, setResourceUsersInitialized] =
        useState(false);

    useEffect(() => {
        if (!isResourceOverlay || resourceRolesInitialized) return;
        if (!resourceRolesData) return;

        const resourceSpecific = resourceRolesData
            .filter((r) => !policyRoleLockedIds.has(r.roleId.toString()))
            .map((r) => ({ id: r.roleId.toString(), text: r.name }));

        initialResourceRoleIdsRef.current = new Set(
            resourceSpecific.map((r) => r.id)
        );
        setCombinedRoles([...policyRoleItems, ...resourceSpecific]);
        setResourceRolesInitialized(true);
    }, [
        isResourceOverlay,
        resourceRolesData,
        resourceRolesInitialized,
        policyRoleItems,
        policyRoleLockedIds
    ]);

    useEffect(() => {
        if (!isResourceOverlay || resourceUsersInitialized) return;
        if (!resourceUsersData) return;

        const resourceSpecific = resourceUsersData
            .filter((u) => !policyUserLockedIds.has(u.userId))
            .map((u) => ({
                id: u.userId,
                text: `${getUserDisplayName({ email: u.email ?? undefined, username: u.username ?? undefined })}${u.type !== UserType.Internal ? ` (${u.idpName})` : ""}`
            }));

        initialResourceUserIdsRef.current = new Set(
            resourceSpecific.map((u) => u.id)
        );
        setCombinedUsers([...policyUserItems, ...resourceSpecific]);
        setResourceUsersInitialized(true);
    }, [
        isResourceOverlay,
        resourceUsersData,
        resourceUsersInitialized,
        policyUserItems,
        policyUserLockedIds
    ]);

    // ── Standard policy form (non-overlay) ──────────────────────────────────
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
            roles: policyRoleItems,
            users: policyUserItems
        }
    });

    const ssoEnabled = useWatch({ control: form.control, name: "sso" });
    const selectedIdpId = useWatch({
        control: form.control,
        name: "skipToIdpId"
    });

    const [, formAction, isSubmitting] = useActionState(onSubmit, null);
    const [isSavingOverlay, setIsSavingOverlay] = useState(false);

    async function onSubmit() {
        if (readonly) return;

        if (isResourceOverlay) {
            await saveResourceOverlay();
            return;
        }

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

    async function saveResourceOverlay() {
        setIsSavingOverlay(true);
        try {
            // Compute which roles/users are resource-specific (non-locked)
            const currentResourceRoleIds = new Set(
                combinedRoles
                    .filter((r) => !policyRoleLockedIds.has(r.id))
                    .map((r) => r.id)
            );
            const currentResourceUserIds = new Set(
                combinedUsers
                    .filter((u) => !policyUserLockedIds.has(u.id))
                    .map((u) => u.id)
            );

            const initialRoleIds = initialResourceRoleIdsRef.current;
            const initialUserIds = initialResourceUserIdsRef.current;

            const addedRoleIds = [...currentResourceRoleIds].filter(
                (id) => !initialRoleIds.has(id)
            );
            const removedRoleIds = [...initialRoleIds].filter(
                (id) => !currentResourceRoleIds.has(id)
            );
            const addedUserIds = [...currentResourceUserIds].filter(
                (id) => !initialUserIds.has(id)
            );
            const removedUserIds = [...initialUserIds].filter(
                (id) => !currentResourceUserIds.has(id)
            );

            await Promise.all([
                ...addedRoleIds.map((id) =>
                    api.post(`/resource/${resourceId}/roles/add`, {
                        roleId: Number(id)
                    })
                ),
                ...removedRoleIds.map((id) =>
                    api.post(`/resource/${resourceId}/roles/remove`, {
                        roleId: Number(id)
                    })
                ),
                ...addedUserIds.map((id) =>
                    api.post(`/resource/${resourceId}/users/add`, {
                        userId: id
                    })
                ),
                ...removedUserIds.map((id) =>
                    api.post(`/resource/${resourceId}/users/remove`, {
                        userId: id
                    })
                )
            ]);

            // Update refs to reflect new state
            initialResourceRoleIdsRef.current = currentResourceRoleIds;
            initialResourceUserIdsRef.current = currentResourceUserIds;

            toast({
                title: t("success"),
                description: t("policyUpdatedSuccess")
            });
            router.refresh();
        } catch (e) {
            toast({
                variant: "destructive",
                title: t("policyErrorUpdate"),
                description: formatAxiosError(
                    e,
                    t("policyErrorUpdateDescription")
                )
            });
        } finally {
            setIsSavingOverlay(false);
        }
    }

    const isLoading =
        isResourceOverlay &&
        (!resourceRolesInitialized || !resourceUsersInitialized);

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
                                    form.setValue("sso", val);
                                }}
                                disabled={readonly || isResourceOverlay}
                            />

                            {ssoEnabled && (
                                <>
                                    <FormItem className="flex flex-col items-start">
                                        <FormLabel>{t("roles")}</FormLabel>
                                        <FormControl>
                                            {isResourceOverlay ? (
                                                <RolesSelector
                                                    orgId={orgId}
                                                    selectedRoles={
                                                        combinedRoles
                                                    }
                                                    onSelectRoles={
                                                        setCombinedRoles
                                                    }
                                                    disabled={isLoading}
                                                    restrictAdminRole
                                                    lockedIds={
                                                        policyRoleLockedIds
                                                    }
                                                />
                                            ) : (
                                                <FormField
                                                    control={form.control}
                                                    name="roles"
                                                    render={({ field }) => (
                                                        <RolesSelector
                                                            orgId={orgId}
                                                            selectedRoles={
                                                                field.value
                                                            }
                                                            onSelectRoles={(
                                                                roles
                                                            ) =>
                                                                form.setValue(
                                                                    "roles",
                                                                    roles
                                                                )
                                                            }
                                                            disabled={readonly}
                                                            restrictAdminRole
                                                        />
                                                    )}
                                                />
                                            )}
                                        </FormControl>
                                        <FormMessage />
                                        <FormDescription>
                                            {t("resourceRoleDescription")}
                                        </FormDescription>
                                    </FormItem>

                                    <FormItem className="flex flex-col items-start">
                                        <FormLabel>{t("users")}</FormLabel>
                                        <FormControl>
                                            {isResourceOverlay ? (
                                                <UsersSelector
                                                    orgId={orgId}
                                                    selectedUsers={
                                                        combinedUsers
                                                    }
                                                    onSelectUsers={
                                                        setCombinedUsers
                                                    }
                                                    disabled={isLoading}
                                                    lockedIds={
                                                        policyUserLockedIds
                                                    }
                                                />
                                            ) : (
                                                <FormField
                                                    control={form.control}
                                                    name="users"
                                                    render={({ field }) => (
                                                        <UsersSelector
                                                            orgId={orgId}
                                                            selectedUsers={
                                                                field.value
                                                            }
                                                            onSelectUsers={(
                                                                users
                                                            ) =>
                                                                form.setValue(
                                                                    "users",
                                                                    users
                                                                )
                                                            }
                                                            disabled={readonly}
                                                        />
                                                    )}
                                                />
                                            )}
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                </>
                            )}

                            {ssoEnabled && allIdps.length > 0 && (
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">
                                        {t("defaultIdentityProvider")}
                                    </label>
                                    <Select
                                        disabled={readonly || isResourceOverlay}
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
                            loading={isSubmitting || isSavingOverlay}
                            disabled={
                                readonly ||
                                isSubmitting ||
                                isSavingOverlay ||
                                isLoading
                            }
                        >
                            {t("resourceUsersRolesSubmit")}
                        </Button>
                    </SettingsSectionFooter>
                </SettingsSection>
            </form>
        </Form>
    );
}
