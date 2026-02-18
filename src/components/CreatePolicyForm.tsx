"use client";

import {
    SettingsContainer,
    SettingsSection,
    SettingsSectionBody,
    SettingsSectionDescription,
    SettingsSectionFooter,
    SettingsSectionForm,
    SettingsSectionHeader,
    SettingsSectionTitle
} from "@app/components/Settings";
import { SwitchInput } from "@app/components/SwitchInput";
import { Tag, TagInput } from "@app/components/tags/tag-input";
import { Alert, AlertDescription, AlertTitle } from "@app/components/ui/alert";
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
import { Input } from "@app/components/ui/input";
import { InfoPopup } from "@app/components/ui/info-popup";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@app/components/ui/select";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useOrgContext } from "@app/hooks/useOrgContext";
import { usePaidStatus } from "@app/hooks/usePaidStatus";
import { createApiClient } from "@app/lib/api";
import { getUserDisplayName } from "@app/lib/getUserDisplayName";
import { orgQueries } from "@app/lib/queries";
import { zodResolver } from "@hookform/resolvers/zod";
import { build } from "@server/build";
import { tierMatrix } from "@server/lib/billing/tierMatrix";
import { UserType } from "@server/types/UserTypes";
import { useQuery } from "@tanstack/react-query";
import { Binary, Bot, InfoIcon, Key } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useActionState, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import z from "zod";

const createPolicySchema = z.object({
    name: z.string().min(1).max(255),
    sso: z.boolean().default(true),
    skipToIdpId: z.number().nullable().optional(),
    emailWhitelistEnabled: z.boolean().default(false),
    roles: z.array(
        z.object({
            id: z.string(),
            text: z.string()
        })
    ),
    users: z.array(
        z.object({
            id: z.string(),
            text: z.string()
        })
    ),
    emails: z.array(
        z.object({
            id: z.string(),
            text: z.string()
        })
    )
});

export type CreatePolicyFormProps = {};

export function CreatePolicyForm({}: CreatePolicyFormProps) {
    const { org } = useOrgContext();
    const t = useTranslations();
    const { env } = useEnvContext();
    const api = createApiClient({ env });
    const [, formAction, isSubmitting] = useActionState(onSubmit, null);
    const router = useRouter();
    const { isPaidUser } = usePaidStatus();

    const { data: orgRoles = [], isLoading: isLoadingOrgRoles } = useQuery(
        orgQueries.roles({
            orgId: org.org.orgId
        })
    );
    const { data: orgUsers = [], isLoading: isLoadingOrgUsers } = useQuery(
        orgQueries.users({
            orgId: org.org.orgId
        })
    );
    const { data: orgIdps = [], isLoading: isLoadingOrgIdps } = useQuery(
        orgQueries.identityProviders({
            orgId: org.org.orgId,
            useOrgOnlyIdp: env.app.identityProviderMode === "org"
        })
    );

    const form = useForm({
        resolver: zodResolver(createPolicySchema),
        defaultValues: {
            name: "",
            sso: true,
            skipToIdpId: null,
            emailWhitelistEnabled: false,
            roles: [],
            users: [],
            emails: []
        }
    });

    const [ssoEnabled, setSsoEnabled] = useState(true);
    const [whitelistEnabled, setWhitelistEnabled] = useState(false);
    const [selectedIdpId, setSelectedIdpId] = useState<number | null>(null);
    const [activeRolesTagIndex, setActiveRolesTagIndex] = useState<
        number | null
    >(null);
    const [activeUsersTagIndex, setActiveUsersTagIndex] = useState<
        number | null
    >(null);
    const [activeEmailTagIndex, setActiveEmailTagIndex] = useState<
        number | null
    >(null);

    async function onSubmit() {
        // ...
    }

    const allRoles = useMemo(() => {
        return orgRoles
            .map((role) => ({
                id: role.roleId.toString(),
                text: role.name
            }))
            .filter((role) => role.text !== "Admin");
    }, [orgRoles]);

    const allUsers = useMemo(() => {
        return orgUsers.map((user) => ({
            id: user.id.toString(),
            text: `${getUserDisplayName({
                email: user.email,
                username: user.username
            })}${user.type !== UserType.Internal ? ` (${user.idpName})` : ""}`
        }));
    }, [orgUsers]);

    const allIdps = useMemo(() => {
        if (build === "saas") {
            if (isPaidUser(tierMatrix.orgOidc)) {
                return orgIdps.map((idp) => ({
                    id: idp.idpId,
                    text: idp.name
                }));
            }
        } else {
            return orgIdps.map((idp) => ({
                id: idp.idpId,
                text: idp.name
            }));
        }
        return [];
    }, [orgIdps]);

    const pageLoading =
        isLoadingOrgRoles || isLoadingOrgUsers || isLoadingOrgIdps;

    if (pageLoading) {
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

                    {/* Users & Roles */}
                    <SettingsSection>
                        <SettingsSectionHeader>
                            <SettingsSectionTitle>
                                {t("resourceUsersRoles")}
                            </SettingsSectionTitle>
                            <SettingsSectionDescription>
                                {t("resourceUsersRolesDescription")}
                            </SettingsSectionDescription>
                        </SettingsSectionHeader>
                        <SettingsSectionBody>
                            <SettingsSectionForm>
                                <SwitchInput
                                    id="sso-toggle"
                                    label={t("ssoUse")}
                                    defaultChecked={true}
                                    onCheckedChange={(val) => {
                                        setSsoEnabled(val);
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
                                                            setTags={(
                                                                newRoles
                                                            ) => {
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
                                                            allowDuplicates={
                                                                false
                                                            }
                                                            restrictTagsToAutocompleteOptions={
                                                                true
                                                            }
                                                            sortTags={true}
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
                                                            setTags={(
                                                                newUsers
                                                            ) => {
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
                                                            allowDuplicates={
                                                                false
                                                            }
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
                                                    setSelectedIdpId(null);
                                                    form.setValue(
                                                        "skipToIdpId",
                                                        null
                                                    );
                                                } else {
                                                    const id = parseInt(value);
                                                    setSelectedIdpId(id);
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
                    </SettingsSection>

                    {/* Auth Methods */}
                    <SettingsSection>
                        <SettingsSectionHeader>
                            <SettingsSectionTitle>
                                {t("resourceAuthMethods")}
                            </SettingsSectionTitle>
                            <SettingsSectionDescription>
                                {t("resourceAuthMethodsDescriptions")}
                            </SettingsSectionDescription>
                        </SettingsSectionHeader>
                        <SettingsSectionBody>
                            <SettingsSectionForm>
                                <div className="flex items-center justify-between border rounded-md p-2 mb-4">
                                    <div className="flex items-center text-sm space-x-2">
                                        <Key size="14" />
                                        <span>
                                            {t("resourcePasswordProtection", {
                                                status: t("disabled")
                                            })}
                                        </span>
                                    </div>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        disabled
                                    >
                                        {t("passwordAdd")}
                                    </Button>
                                </div>

                                <div className="flex items-center justify-between border rounded-md p-2">
                                    <div className="flex items-center space-x-2 text-sm">
                                        <Binary size="14" />
                                        <span>
                                            {t("resourcePincodeProtection", {
                                                status: t("disabled")
                                            })}
                                        </span>
                                    </div>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        disabled
                                    >
                                        {t("pincodeAdd")}
                                    </Button>
                                </div>

                                <div className="flex items-center justify-between border rounded-md p-2">
                                    <div className="flex items-center space-x-2 text-sm">
                                        <Bot size="14" />
                                        <span>
                                            {t(
                                                "resourceHeaderAuthProtectionDisabled"
                                            )}
                                        </span>
                                    </div>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        disabled
                                    >
                                        {t("headerAuthAdd")}
                                    </Button>
                                </div>
                            </SettingsSectionForm>
                        </SettingsSectionBody>
                    </SettingsSection>

                    {/* OTP Email */}
                    <SettingsSection>
                        <SettingsSectionHeader>
                            <SettingsSectionTitle>
                                {t("otpEmailTitle")}
                            </SettingsSectionTitle>
                            <SettingsSectionDescription>
                                {t("otpEmailTitleDescription")}
                            </SettingsSectionDescription>
                        </SettingsSectionHeader>
                        <SettingsSectionBody>
                            <SettingsSectionForm>
                                {!env.email.emailEnabled && (
                                    <Alert variant="neutral" className="mb-4">
                                        <InfoIcon className="h-4 w-4" />
                                        <AlertTitle className="font-semibold">
                                            {t("otpEmailSmtpRequired")}
                                        </AlertTitle>
                                        <AlertDescription>
                                            {t(
                                                "otpEmailSmtpRequiredDescription"
                                            )}
                                        </AlertDescription>
                                    </Alert>
                                )}
                                <SwitchInput
                                    id="whitelist-toggle"
                                    label={t("otpEmailWhitelist")}
                                    defaultChecked={false}
                                    onCheckedChange={(val) => {
                                        setWhitelistEnabled(val);
                                        form.setValue(
                                            "emailWhitelistEnabled",
                                            val
                                        );
                                    }}
                                    disabled={!env.email.emailEnabled}
                                />

                                {whitelistEnabled && env.email.emailEnabled && (
                                    <FormField
                                        control={form.control}
                                        name="emails"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>
                                                    <InfoPopup
                                                        text={t(
                                                            "otpEmailWhitelistList"
                                                        )}
                                                        info={t(
                                                            "otpEmailWhitelistListDescription"
                                                        )}
                                                    />
                                                </FormLabel>
                                                <FormControl>
                                                    {/* @ts-ignore */}
                                                    <TagInput
                                                        {...field}
                                                        activeTagIndex={
                                                            activeEmailTagIndex
                                                        }
                                                        size="sm"
                                                        validateTag={(tag) => {
                                                            return z
                                                                .email()
                                                                .or(
                                                                    z
                                                                        .string()
                                                                        .regex(
                                                                            /^\*@[\w.-]+\.[a-zA-Z]{2,}$/,
                                                                            {
                                                                                message:
                                                                                    t(
                                                                                        "otpEmailErrorInvalid"
                                                                                    )
                                                                            }
                                                                        )
                                                                )
                                                                .safeParse(tag)
                                                                .success;
                                                        }}
                                                        setActiveTagIndex={
                                                            setActiveEmailTagIndex
                                                        }
                                                        placeholder={t(
                                                            "otpEmailEnter"
                                                        )}
                                                        tags={
                                                            form.getValues()
                                                                .emails
                                                        }
                                                        setTags={(
                                                            newEmails
                                                        ) => {
                                                            form.setValue(
                                                                "emails",
                                                                newEmails as [
                                                                    Tag,
                                                                    ...Tag[]
                                                                ]
                                                            );
                                                        }}
                                                        allowDuplicates={false}
                                                        sortTags={true}
                                                    />
                                                </FormControl>
                                                <FormDescription>
                                                    {t(
                                                        "otpEmailEnterDescription"
                                                    )}
                                                </FormDescription>
                                            </FormItem>
                                        )}
                                    />
                                )}
                            </SettingsSectionForm>
                        </SettingsSectionBody>
                        <SettingsSectionFooter>
                            <Button
                                type="submit"
                                loading={isSubmitting}
                                disabled={isSubmitting}
                            >
                                {t("resourcePoliciesCreate")}
                            </Button>
                        </SettingsSectionFooter>
                    </SettingsSection>
                </SettingsContainer>
            </form>
        </Form>
    );
}
