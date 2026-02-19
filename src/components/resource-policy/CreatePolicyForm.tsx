"use client";

import {
    SettingsContainer,
    SettingsSection,
    SettingsSectionBody,
    SettingsSectionDescription,
    SettingsSectionForm,
    SettingsSectionHeader,
    SettingsSectionTitle
} from "@app/components/Settings";
import { Button } from "@app/components/ui/button";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@app/components/ui/form";
import { Input } from "@app/components/ui/input";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useOrgContext } from "@app/hooks/useOrgContext";
import { usePaidStatus } from "@app/hooks/usePaidStatus";

import { getUserDisplayName } from "@app/lib/getUserDisplayName";
import { orgQueries } from "@app/lib/queries";
import { zodResolver } from "@hookform/resolvers/zod";
import { build } from "@server/build";
import { tierMatrix } from "@server/lib/billing/tierMatrix";
import { UserType } from "@server/types/UserTypes";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { useActionState, useMemo } from "react";
import { useForm } from "react-hook-form";
import z from "zod";
import {
    PolicyAuthMethodsSection,
    PolicyOtpEmailSection,
    PolicyRulesSection,
    PolicyUsersRolesSection
} from "./ResourcePolicySubForms";
import { type PolicyFormValues, createPolicySchema } from ".";

// ─── CreatePolicyForm ─────────────────────────────────────────────────────────

export type CreatePolicyFormProps = {};

export function CreatePolicyForm({}: CreatePolicyFormProps) {
    const { org } = useOrgContext();
    const t = useTranslations();
    const { env } = useEnvContext();
    const [, formAction, isSubmitting] = useActionState(onSubmit, null);
    const { isPaidUser } = usePaidStatus();

    const isMaxmindAvailable = !!(
        env.server.maxmind_db_path && env.server.maxmind_db_path.length > 0
    );
    const isMaxmindAsnAvailable = !!(
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

    const form = useForm<PolicyFormValues>({
        resolver: zodResolver(createPolicySchema) as any,
        defaultValues: {
            name: "",
            sso: true,
            skipToIdpId: null,
            emailWhitelistEnabled: false,
            roles: [],
            users: [],
            emails: [],
            applyRules: false,
            rules: [],
            password: null,
            headerAuth: null,
            pincode: null
        }
    });

    async function onSubmit() {
        const isValid = await form.trigger();

        if (!isValid) return;
    }

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
        <Form {...form}>
            <form action={formAction}>
                <SettingsContainer>
                    {/* Name */}
                    <SettingsSection>
                        <SettingsSectionHeader>
                            <SettingsSectionTitle>
                                {t("resourcePolicyName")}
                            </SettingsSectionTitle>
                            <SettingsSectionDescription>
                                {t("resourcePolicyNameDescription")}
                            </SettingsSectionDescription>
                        </SettingsSectionHeader>
                        <SettingsSectionBody>
                            <SettingsSectionForm>
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t("name")}</FormLabel>
                                            <FormControl>
                                                <Input
                                                    {...field}
                                                    placeholder={t(
                                                        "resourcePolicyNamePlaceholder"
                                                    )}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </SettingsSectionForm>
                        </SettingsSectionBody>
                    </SettingsSection>

                    <PolicyUsersRolesSection
                        form={form}
                        allRoles={allRoles}
                        allUsers={allUsers}
                        allIdps={allIdps}
                    />
                    <PolicyAuthMethodsSection form={form} />
                    <PolicyOtpEmailSection
                        form={form}
                        emailEnabled={env.email.emailEnabled}
                    />
                    <PolicyRulesSection
                        form={form}
                        isMaxmindAvailable={isMaxmindAvailable}
                        isMaxmindAsnAvailable={isMaxmindAsnAvailable}
                    />
                </SettingsContainer>

                <div className="flex py-6 justify-end">
                    <Button
                        type="submit"
                        loading={isSubmitting}
                        disabled={isSubmitting}
                    >
                        {t("resourcePoliciesCreate")}
                    </Button>
                </div>
            </form>
        </Form>
    );
}
