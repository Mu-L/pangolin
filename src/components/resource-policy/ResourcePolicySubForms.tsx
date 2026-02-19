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
import { Alert, AlertDescription, AlertTitle } from "@app/components/ui/alert";
import { Button } from "@app/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList
} from "@app/components/ui/command";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@app/components/ui/form";
import { InfoPopup } from "@app/components/ui/info-popup";
import { Input } from "@app/components/ui/input";
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@app/components/ui/popover";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@app/components/ui/select";
import { Switch } from "@app/components/ui/switch";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@app/components/ui/table";
import {
    Credenza,
    CredenzaBody,
    CredenzaClose,
    CredenzaContent,
    CredenzaDescription,
    CredenzaFooter,
    CredenzaHeader,
    CredenzaTitle
} from "@app/components/Credenza";
import { toast } from "@app/hooks/useToast";
import {
    InputOTP,
    InputOTPGroup,
    InputOTPSlot
} from "@app/components/ui/input-otp";

import { zodResolver } from "@hookform/resolvers/zod";
import { MAJOR_ASNS } from "@server/db/asns";
import { COUNTRIES } from "@server/db/countries";
import {
    isValidCIDR,
    isValidIP,
    isValidUrlGlobPattern
} from "@server/lib/validators";
import {
    ColumnDef,
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable
} from "@tanstack/react-table";
import {
    ArrowUpDown,
    Binary,
    Bot,
    Check,
    ChevronsUpDown,
    InfoIcon,
    Key,
    Plus
} from "lucide-react";
import { useTranslations } from "next-intl";

import { useCallback, useMemo, useState } from "react";
import { UseFormReturn, useForm } from "react-hook-form";
import z from "zod";
import type { PolicyFormValues } from ".";

const addRuleSchema = z.object({
    action: z.enum(["ACCEPT", "DROP", "PASS"]),
    match: z.string(),
    value: z.string(),
    priority: z.coerce.number<number>().int().optional()
});

type LocalRule = {
    ruleId: number;
    action: "ACCEPT" | "DROP" | "PASS";
    match: string;
    value: string;
    priority: number;
    enabled: boolean;
    new?: boolean;
    updated?: boolean;
};

type PolicyUsersRolesSectionProps = {
    form: UseFormReturn<PolicyFormValues, any, any>;
    allRoles: { id: string; text: string }[];
    allUsers: { id: string; text: string }[];
    allIdps: { id: number; text: string }[];
};

// ─── PolicyUsersRolesSection ──────────────────────────────────────────────────

export function PolicyUsersRolesSection({
    form,
    allRoles,
    allUsers,
    allIdps
}: PolicyUsersRolesSectionProps) {
    const t = useTranslations();
    const ssoEnabled = form.watch("sso");
    const selectedIdpId = form.watch("skipToIdpId");
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

// ─── PolicyAuthMethodsSection ─────────────────────────────────────────────────

const setPasswordSchema = z.object({
    password: z.string().min(4).max(100)
});

const setPincodeSchema = z.object({
    pincode: z.string().length(6)
});

const setHeaderAuthSchema = z.object({
    user: z.string().min(4).max(100),
    password: z.string().min(4).max(100),
    extendedCompatibility: z.boolean()
});

type PolicyAuthMethodsSectionProps = {
    form: UseFormReturn<PolicyFormValues, any, any>;
};

export function PolicyAuthMethodsSection({
    form
}: PolicyAuthMethodsSectionProps) {
    const t = useTranslations();
    const [isOpen, setIsOpen] = useState(false);
    const [isSetPasswordOpen, setIsSetPasswordOpen] = useState(false);
    const [isSetPincodeOpen, setIsSetPincodeOpen] = useState(false);
    const [isSetHeaderAuthOpen, setIsSetHeaderAuthOpen] = useState(false);

    const password = form.watch("password");
    const pincode = form.watch("pincode");
    const headerAuth = form.watch("headerAuth");

    const passwordForm = useForm({
        resolver: zodResolver(setPasswordSchema),
        defaultValues: { password: "" }
    });

    const pincodeForm = useForm({
        resolver: zodResolver(setPincodeSchema),
        defaultValues: { pincode: "" }
    });

    const headerAuthForm = useForm({
        resolver: zodResolver(setHeaderAuthSchema),
        defaultValues: { user: "", password: "", extendedCompatibility: true }
    });

    if (!isOpen) {
        return (
            <SettingsSection>
                <SettingsSectionHeader>
                    <SettingsSectionTitle>
                        {t("resourceAuthMethods")}
                    </SettingsSectionTitle>
                    <SettingsSectionDescription>
                        {t("resourcePolicyAuthMethodsDescription")}
                    </SettingsSectionDescription>
                </SettingsSectionHeader>
                <SettingsSectionBody>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsOpen(true)}
                    >
                        <Plus className="mr-2 h-4 w-4" />
                        {t("resourcePolicyAuthMethodAdd")}
                    </Button>
                </SettingsSectionBody>
            </SettingsSection>
        );
    }

    return (
        <>
            {/* Password Credenza */}
            <Credenza
                open={isSetPasswordOpen}
                onOpenChange={(val) => {
                    setIsSetPasswordOpen(val);
                    if (!val) passwordForm.reset();
                }}
            >
                <CredenzaContent>
                    <CredenzaHeader>
                        <CredenzaTitle>
                            {t("resourcePasswordSetupTitle")}
                        </CredenzaTitle>
                        <CredenzaDescription>
                            {t("resourcePasswordSetupTitleDescription")}
                        </CredenzaDescription>
                    </CredenzaHeader>
                    <CredenzaBody>
                        <Form {...passwordForm}>
                            <form
                                onSubmit={passwordForm.handleSubmit((data) => {
                                    form.setValue("password", data);
                                    setIsSetPasswordOpen(false);
                                    passwordForm.reset();
                                })}
                                className="space-y-4"
                                id="set-password-form"
                            >
                                <FormField
                                    control={passwordForm.control}
                                    name="password"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                {t("password")}
                                            </FormLabel>
                                            <FormControl>
                                                <Input
                                                    autoComplete="off"
                                                    type="password"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </form>
                        </Form>
                    </CredenzaBody>
                    <CredenzaFooter>
                        <CredenzaClose asChild>
                            <Button variant="outline">{t("close")}</Button>
                        </CredenzaClose>
                        <Button type="submit" form="set-password-form">
                            {t("resourcePasswordSubmit")}
                        </Button>
                    </CredenzaFooter>
                </CredenzaContent>
            </Credenza>

            {/* Pincode Credenza */}
            <Credenza
                open={isSetPincodeOpen}
                onOpenChange={(val) => {
                    setIsSetPincodeOpen(val);
                    if (!val) pincodeForm.reset();
                }}
            >
                <CredenzaContent>
                    <CredenzaHeader>
                        <CredenzaTitle>
                            {t("resourcePincodeSetupTitle")}
                        </CredenzaTitle>
                        <CredenzaDescription>
                            {t("resourcePincodeSetupTitleDescription")}
                        </CredenzaDescription>
                    </CredenzaHeader>
                    <CredenzaBody>
                        <Form {...pincodeForm}>
                            <form
                                onSubmit={pincodeForm.handleSubmit((data) => {
                                    form.setValue("pincode", data);
                                    setIsSetPincodeOpen(false);
                                    pincodeForm.reset();
                                })}
                                className="space-y-4"
                                id="set-pincode-form"
                            >
                                <FormField
                                    control={pincodeForm.control}
                                    name="pincode"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                {t("resourcePincode")}
                                            </FormLabel>
                                            <FormControl>
                                                <div className="flex justify-center">
                                                    <InputOTP
                                                        autoComplete="false"
                                                        maxLength={6}
                                                        {...field}
                                                    >
                                                        <InputOTPGroup className="flex">
                                                            <InputOTPSlot
                                                                index={0}
                                                                obscured
                                                            />
                                                            <InputOTPSlot
                                                                index={1}
                                                                obscured
                                                            />
                                                            <InputOTPSlot
                                                                index={2}
                                                                obscured
                                                            />
                                                            <InputOTPSlot
                                                                index={3}
                                                                obscured
                                                            />
                                                            <InputOTPSlot
                                                                index={4}
                                                                obscured
                                                            />
                                                            <InputOTPSlot
                                                                index={5}
                                                                obscured
                                                            />
                                                        </InputOTPGroup>
                                                    </InputOTP>
                                                </div>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </form>
                        </Form>
                    </CredenzaBody>
                    <CredenzaFooter>
                        <CredenzaClose asChild>
                            <Button variant="outline">{t("close")}</Button>
                        </CredenzaClose>
                        <Button type="submit" form="set-pincode-form">
                            {t("resourcePincodeSubmit")}
                        </Button>
                    </CredenzaFooter>
                </CredenzaContent>
            </Credenza>

            {/* Header Auth Credenza */}
            <Credenza
                open={isSetHeaderAuthOpen}
                onOpenChange={(val) => {
                    setIsSetHeaderAuthOpen(val);
                    if (!val) headerAuthForm.reset();
                }}
            >
                <CredenzaContent>
                    <CredenzaHeader>
                        <CredenzaTitle>
                            {t("resourceHeaderAuthSetupTitle")}
                        </CredenzaTitle>
                        <CredenzaDescription>
                            {t("resourceHeaderAuthSetupTitleDescription")}
                        </CredenzaDescription>
                    </CredenzaHeader>
                    <CredenzaBody>
                        <Form {...headerAuthForm}>
                            <form
                                onSubmit={headerAuthForm.handleSubmit((data) => {
                                    form.setValue("headerAuth", data);
                                    setIsSetHeaderAuthOpen(false);
                                    headerAuthForm.reset();
                                })}
                                className="space-y-4"
                                id="set-header-auth-form"
                            >
                                <FormField
                                    control={headerAuthForm.control}
                                    name="user"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t("user")}</FormLabel>
                                            <FormControl>
                                                <Input
                                                    autoComplete="off"
                                                    type="text"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={headerAuthForm.control}
                                    name="password"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                {t("password")}
                                            </FormLabel>
                                            <FormControl>
                                                <Input
                                                    autoComplete="off"
                                                    type="password"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={headerAuthForm.control}
                                    name="extendedCompatibility"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormControl>
                                                <SwitchInput
                                                    id="header-auth-compatibility-toggle"
                                                    label={t(
                                                        "headerAuthCompatibility"
                                                    )}
                                                    info={t(
                                                        "headerAuthCompatibilityInfo"
                                                    )}
                                                    checked={field.value}
                                                    onCheckedChange={
                                                        field.onChange
                                                    }
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </form>
                        </Form>
                    </CredenzaBody>
                    <CredenzaFooter>
                        <CredenzaClose asChild>
                            <Button variant="outline">{t("close")}</Button>
                        </CredenzaClose>
                        <Button type="submit" form="set-header-auth-form">
                            {t("resourceHeaderAuthSubmit")}
                        </Button>
                    </CredenzaFooter>
                </CredenzaContent>
            </Credenza>

            <SettingsSection>
                <SettingsSectionHeader>
                    <SettingsSectionTitle>
                        {t("resourceAuthMethods")}
                    </SettingsSectionTitle>
                    <SettingsSectionDescription>
                        {t("resourcePolicyAuthMethodsDescription")}
                    </SettingsSectionDescription>
                </SettingsSectionHeader>
                <SettingsSectionBody>
                    <SettingsSectionForm>
                        {/* Password row */}
                        <div className="flex items-center justify-between border rounded-md p-2 mb-4">
                            <div
                                className={`flex items-center ${password ? "text-green-500" : ""} text-sm space-x-2`}
                            >
                                <Key size="14" />
                                <span>
                                    {t("resourcePasswordProtection", {
                                        status: password
                                            ? t("enabled")
                                            : t("disabled")
                                    })}
                                </span>
                            </div>
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={
                                    password
                                        ? () => form.setValue("password", null)
                                        : () => setIsSetPasswordOpen(true)
                                }
                            >
                                {password ? t("passwordRemove") : t("passwordAdd")}
                            </Button>
                        </div>

                        {/* Pincode row */}
                        <div className="flex items-center justify-between border rounded-md p-2">
                            <div
                                className={`flex items-center ${pincode ? "text-green-500" : ""} space-x-2 text-sm`}
                            >
                                <Binary size="14" />
                                <span>
                                    {t("resourcePincodeProtection", {
                                        status: pincode
                                            ? t("enabled")
                                            : t("disabled")
                                    })}
                                </span>
                            </div>
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={
                                    pincode
                                        ? () => form.setValue("pincode", null)
                                        : () => setIsSetPincodeOpen(true)
                                }
                            >
                                {pincode ? t("pincodeRemove") : t("pincodeAdd")}
                            </Button>
                        </div>

                        {/* Header auth row */}
                        <div className="flex items-center justify-between border rounded-md p-2">
                            <div
                                className={`flex items-center ${headerAuth ? "text-green-500" : ""} space-x-2 text-sm`}
                            >
                                <Bot size="14" />
                                <span>
                                    {headerAuth
                                        ? t("resourceHeaderAuthProtectionEnabled")
                                        : t("resourceHeaderAuthProtectionDisabled")}
                                </span>
                            </div>
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={
                                    headerAuth
                                        ? () =>
                                              form.setValue("headerAuth", null)
                                        : () => setIsSetHeaderAuthOpen(true)
                                }
                            >
                                {headerAuth
                                    ? t("headerAuthRemove")
                                    : t("headerAuthAdd")}
                            </Button>
                        </div>
                    </SettingsSectionForm>
                </SettingsSectionBody>
            </SettingsSection>
        </>
    );
}

// ─── PolicyOtpEmailSection ────────────────────────────────────────────────────

type PolicyOtpEmailSectionProps = {
    form: UseFormReturn<PolicyFormValues, any, any>;
    emailEnabled: boolean;
};

export function PolicyOtpEmailSection({
    form,
    emailEnabled
}: PolicyOtpEmailSectionProps) {
    const t = useTranslations();
    const [isOpen, setIsOpen] = useState(false);
    const [whitelistEnabled, setWhitelistEnabled] = useState(false);
    const [activeEmailTagIndex, setActiveEmailTagIndex] = useState<
        number | null
    >(null);

    if (!isOpen) {
        return (
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
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsOpen(true)}
                    >
                        <Plus className="mr-2 h-4 w-4" />
                        {t("resourcePolicyOtpEmailAdd")}
                    </Button>
                </SettingsSectionBody>
            </SettingsSection>
        );
    }

    return (
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
                    {!emailEnabled && (
                        <Alert variant="neutral" className="mb-4">
                            <InfoIcon className="h-4 w-4" />
                            <AlertTitle className="font-semibold">
                                {t("otpEmailSmtpRequired")}
                            </AlertTitle>
                            <AlertDescription>
                                {t("otpEmailSmtpRequiredDescription")}
                            </AlertDescription>
                        </Alert>
                    )}
                    <SwitchInput
                        id="whitelist-toggle"
                        label={t("otpEmailWhitelist")}
                        defaultChecked={false}
                        onCheckedChange={(val) => {
                            setWhitelistEnabled(val);
                            form.setValue("emailWhitelistEnabled", val);
                        }}
                        disabled={!emailEnabled}
                    />

                    {whitelistEnabled && emailEnabled && (
                        <FormField
                            control={form.control}
                            name="emails"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>
                                        <InfoPopup
                                            text={t("otpEmailWhitelistList")}
                                            info={t(
                                                "otpEmailWhitelistListDescription"
                                            )}
                                        />
                                    </FormLabel>
                                    <FormControl>
                                        {/* @ts-ignore */}
                                        <TagInput
                                            {...field}
                                            activeTagIndex={activeEmailTagIndex}
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
                                                                    message: t(
                                                                        "otpEmailErrorInvalid"
                                                                    )
                                                                }
                                                            )
                                                    )
                                                    .safeParse(tag).success;
                                            }}
                                            setActiveTagIndex={
                                                setActiveEmailTagIndex
                                            }
                                            placeholder={t("otpEmailEnter")}
                                            tags={form.getValues().emails}
                                            setTags={(newEmails) => {
                                                form.setValue(
                                                    "emails",
                                                    newEmails as [Tag, ...Tag[]]
                                                );
                                            }}
                                            allowDuplicates={false}
                                            sortTags={true}
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        {t("otpEmailEnterDescription")}
                                    </FormDescription>
                                </FormItem>
                            )}
                        />
                    )}
                </SettingsSectionForm>
            </SettingsSectionBody>
        </SettingsSection>
    );
}

// ─── PolicyRulesSection ───────────────────────────────────────────────────────

type PolicyRulesSectionProps = {
    form: UseFormReturn<PolicyFormValues, any, any>;
    isMaxmindAvailable: boolean;
    isMaxmindAsnAvailable: boolean;
};

export function PolicyRulesSection({
    form,
    isMaxmindAvailable,
    isMaxmindAsnAvailable
}: PolicyRulesSectionProps) {
    const t = useTranslations();
    const [isOpen, setIsOpen] = useState(false);
    const [rules, setRules] = useState<LocalRule[]>([]);
    const [rulesEnabled, setRulesEnabled] = useState(false);
    const [openAddRuleCountrySelect, setOpenAddRuleCountrySelect] =
        useState(false);
    const [openAddRuleAsnSelect, setOpenAddRuleAsnSelect] = useState(false);

    const addRuleForm = useForm({
        resolver: zodResolver(addRuleSchema),
        defaultValues: {
            action: "ACCEPT" as const,
            match: "IP",
            value: ""
        }
    });

    const RuleAction = useMemo(
        () => ({
            ACCEPT: t("alwaysAllow"),
            DROP: t("alwaysDeny"),
            PASS: t("passToAuth")
        }),
        [t]
    );

    const RuleMatch = useMemo(
        () => ({
            PATH: t("path"),
            IP: "IP",
            CIDR: t("ipAddressRange"),
            COUNTRY: t("country"),
            ASN: "ASN"
        }),
        [t]
    );

    const syncFormRules = useCallback(
        (updatedRules: LocalRule[]) => {
            form.setValue(
                "rules",
                updatedRules.map(
                    ({ action, match, value, priority, enabled }) => ({
                        action,
                        match,
                        value,
                        priority,
                        enabled
                    })
                )
            );
        },
        [form]
    );

    const addRule = useCallback(
        function addRule(data: z.infer<typeof addRuleSchema>) {
            const isDuplicate = rules.some(
                (rule) =>
                    rule.action === data.action &&
                    rule.match === data.match &&
                    rule.value === data.value
            );
            if (isDuplicate) {
                toast({
                    variant: "destructive",
                    title: t("rulesErrorDuplicate"),
                    description: t("rulesErrorDuplicateDescription")
                });
                return;
            }
            if (data.match === "CIDR" && !isValidCIDR(data.value)) {
                toast({
                    variant: "destructive",
                    title: t("rulesErrorInvalidIpAddressRange"),
                    description: t("rulesErrorInvalidIpAddressRangeDescription")
                });
                return;
            }
            if (data.match === "PATH" && !isValidUrlGlobPattern(data.value)) {
                toast({
                    variant: "destructive",
                    title: t("rulesErrorInvalidUrl"),
                    description: t("rulesErrorInvalidUrlDescription")
                });
                return;
            }
            if (data.match === "IP" && !isValidIP(data.value)) {
                toast({
                    variant: "destructive",
                    title: t("rulesErrorInvalidIpAddress"),
                    description: t("rulesErrorInvalidIpAddressDescription")
                });
                return;
            }
            if (
                data.match === "COUNTRY" &&
                !COUNTRIES.some((c) => c.code === data.value)
            ) {
                toast({
                    variant: "destructive",
                    title: t("rulesErrorInvalidCountry"),
                    description: t("rulesErrorInvalidCountryDescription") || ""
                });
                return;
            }

            let priority = data.priority;
            if (priority === undefined) {
                priority =
                    rules.reduce(
                        (acc, rule) =>
                            rule.priority > acc ? rule.priority : acc,
                        0
                    ) + 1;
            }

            const updatedRules = [
                ...rules,
                {
                    ...data,
                    ruleId: new Date().getTime(),
                    new: true,
                    priority,
                    enabled: true
                }
            ];
            setRules(updatedRules);
            syncFormRules(updatedRules);
            addRuleForm.reset();
        },
        [rules, t, addRuleForm, syncFormRules]
    );

    const removeRule = useCallback(
        function removeRule(ruleId: number) {
            const updatedRules = rules.filter((rule) => rule.ruleId !== ruleId);
            setRules(updatedRules);
            syncFormRules(updatedRules);
        },
        [rules, syncFormRules]
    );

    const updateRule = useCallback(
        function updateRule(ruleId: number, data: Partial<LocalRule>) {
            const updatedRules = rules.map((rule) =>
                rule.ruleId === ruleId
                    ? { ...rule, ...data, updated: true }
                    : rule
            );
            setRules(updatedRules);
            syncFormRules(updatedRules);
        },
        [rules, syncFormRules]
    );

    const getValueHelpText = useCallback(
        function getValueHelpText(type: string) {
            switch (type) {
                case "CIDR":
                    return t("rulesMatchIpAddressRangeDescription");
                case "IP":
                    return t("rulesMatchIpAddress");
                case "PATH":
                    return t("rulesMatchUrl");
                case "COUNTRY":
                    return t("rulesMatchCountry");
                case "ASN":
                    return "Enter an Autonomous System Number (e.g., AS15169 or 15169)";
            }
        },
        [t]
    );

    const columns: ColumnDef<LocalRule>[] = useMemo(
        () => [
            {
                accessorKey: "priority",
                header: ({ column }) => (
                    <Button
                        variant="ghost"
                        onClick={() =>
                            column.toggleSorting(column.getIsSorted() === "asc")
                        }
                    >
                        {t("rulesPriority")}
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                ),
                cell: ({ row }) => (
                    <Input
                        defaultValue={row.original.priority}
                        className="w-[75px]"
                        type="number"
                        onClick={(e) => e.currentTarget.focus()}
                        onBlur={(e) => {
                            const parsed = z.coerce
                                .number()
                                .int()
                                .optional()
                                .safeParse(e.target.value);
                            if (!parsed.success) {
                                toast({
                                    variant: "destructive",
                                    title: t("rulesErrorInvalidPriority"),
                                    description: t(
                                        "rulesErrorInvalidPriorityDescription"
                                    )
                                });
                                return;
                            }
                            updateRule(row.original.ruleId, {
                                priority: parsed.data
                            });
                        }}
                    />
                )
            },
            {
                accessorKey: "action",
                header: () => <span className="p-3">{t("rulesAction")}</span>,
                cell: ({ row }) => (
                    <Select
                        defaultValue={row.original.action}
                        onValueChange={(value: "ACCEPT" | "DROP" | "PASS") =>
                            updateRule(row.original.ruleId, { action: value })
                        }
                    >
                        <SelectTrigger className="min-w-[150px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ACCEPT">
                                {RuleAction.ACCEPT}
                            </SelectItem>
                            <SelectItem value="DROP">
                                {RuleAction.DROP}
                            </SelectItem>
                            <SelectItem value="PASS">
                                {RuleAction.PASS}
                            </SelectItem>
                        </SelectContent>
                    </Select>
                )
            },
            {
                accessorKey: "match",
                header: () => (
                    <span className="p-3">{t("rulesMatchType")}</span>
                ),
                cell: ({ row }) => (
                    <Select
                        defaultValue={row.original.match}
                        onValueChange={(
                            value: "CIDR" | "IP" | "PATH" | "COUNTRY" | "ASN"
                        ) =>
                            updateRule(row.original.ruleId, {
                                match: value,
                                value:
                                    value === "COUNTRY"
                                        ? "US"
                                        : value === "ASN"
                                          ? "AS15169"
                                          : row.original.value
                            })
                        }
                    >
                        <SelectTrigger className="min-w-[125px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="PATH">
                                {RuleMatch.PATH}
                            </SelectItem>
                            <SelectItem value="IP">{RuleMatch.IP}</SelectItem>
                            <SelectItem value="CIDR">
                                {RuleMatch.CIDR}
                            </SelectItem>
                            {isMaxmindAvailable && (
                                <SelectItem value="COUNTRY">
                                    {RuleMatch.COUNTRY}
                                </SelectItem>
                            )}
                            {isMaxmindAsnAvailable && (
                                <SelectItem value="ASN">
                                    {RuleMatch.ASN}
                                </SelectItem>
                            )}
                        </SelectContent>
                    </Select>
                )
            },
            {
                accessorKey: "value",
                header: () => <span className="p-3">{t("value")}</span>,
                cell: ({ row }) =>
                    row.original.match === "COUNTRY" ? (
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    className="min-w-50 justify-between"
                                >
                                    {row.original.value
                                        ? COUNTRIES.find(
                                              (c) =>
                                                  c.code === row.original.value
                                          )?.name +
                                          " (" +
                                          row.original.value +
                                          ")"
                                        : t("selectCountry")}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="min-w-50 p-0">
                                <Command>
                                    <CommandInput
                                        placeholder={t("searchCountries")}
                                    />
                                    <CommandList>
                                        <CommandEmpty>
                                            {t("noCountryFound")}
                                        </CommandEmpty>
                                        <CommandGroup>
                                            {COUNTRIES.map((country) => (
                                                <CommandItem
                                                    key={country.code}
                                                    value={country.name}
                                                    onSelect={() =>
                                                        updateRule(
                                                            row.original.ruleId,
                                                            {
                                                                value: country.code
                                                            }
                                                        )
                                                    }
                                                >
                                                    <Check
                                                        className={`mr-2 h-4 w-4 ${row.original.value === country.code ? "opacity-100" : "opacity-0"}`}
                                                    />
                                                    {country.name} (
                                                    {country.code})
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    ) : row.original.match === "ASN" ? (
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    className="min-w-50 justify-between"
                                >
                                    {row.original.value
                                        ? (() => {
                                              const found = MAJOR_ASNS.find(
                                                  (asn) =>
                                                      asn.code ===
                                                      row.original.value
                                              );
                                              return found
                                                  ? `${found.name} (${row.original.value})`
                                                  : `Custom (${row.original.value})`;
                                          })()
                                        : "Select ASN"}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="min-w-50 p-0">
                                <Command>
                                    <CommandInput placeholder="Search ASNs or enter custom..." />
                                    <CommandList>
                                        <CommandEmpty>
                                            No ASN found. Enter a custom ASN
                                            below.
                                        </CommandEmpty>
                                        <CommandGroup>
                                            {MAJOR_ASNS.map((asn) => (
                                                <CommandItem
                                                    key={asn.code}
                                                    value={
                                                        asn.name +
                                                        " " +
                                                        asn.code
                                                    }
                                                    onSelect={() =>
                                                        updateRule(
                                                            row.original.ruleId,
                                                            { value: asn.code }
                                                        )
                                                    }
                                                >
                                                    <Check
                                                        className={`mr-2 h-4 w-4 ${row.original.value === asn.code ? "opacity-100" : "opacity-0"}`}
                                                    />
                                                    {asn.name} ({asn.code})
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                                <div className="border-t p-2">
                                    <Input
                                        placeholder="Enter custom ASN (e.g., AS15169)"
                                        defaultValue={
                                            !MAJOR_ASNS.find(
                                                (asn) =>
                                                    asn.code ===
                                                    row.original.value
                                            )
                                                ? row.original.value
                                                : ""
                                        }
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                const value =
                                                    e.currentTarget.value
                                                        .toUpperCase()
                                                        .replace(/^AS/, "");
                                                if (/^\d+$/.test(value)) {
                                                    updateRule(
                                                        row.original.ruleId,
                                                        { value: "AS" + value }
                                                    );
                                                }
                                            }
                                        }}
                                        className="text-sm"
                                    />
                                </div>
                            </PopoverContent>
                        </Popover>
                    ) : (
                        <Input
                            defaultValue={row.original.value}
                            className="min-w-50"
                            onBlur={(e) =>
                                updateRule(row.original.ruleId, {
                                    value: e.target.value
                                })
                            }
                        />
                    )
            },
            {
                accessorKey: "enabled",
                header: () => <span className="p-3">{t("enabled")}</span>,
                cell: ({ row }) => (
                    <Switch
                        defaultChecked={row.original.enabled}
                        onCheckedChange={(val) =>
                            updateRule(row.original.ruleId, { enabled: val })
                        }
                    />
                )
            },
            {
                id: "actions",
                header: () => <span className="p-3">{t("actions")}</span>,
                cell: ({ row }) => (
                    <div className="flex items-center space-x-2">
                        <Button
                            variant="outline"
                            onClick={() => removeRule(row.original.ruleId)}
                        >
                            {t("delete")}
                        </Button>
                    </div>
                )
            }
        ],
        [
            t,
            RuleAction,
            RuleMatch,
            isMaxmindAvailable,
            isMaxmindAsnAvailable,
            updateRule,
            removeRule
        ]
    );

    const table = useReactTable({
        data: rules,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        state: { pagination: { pageIndex: 0, pageSize: 1000 } }
    });

    if (!isOpen) {
        return (
            <SettingsSection>
                <SettingsSectionHeader>
                    <SettingsSectionTitle>
                        {t("rulesResource")}
                    </SettingsSectionTitle>
                    <SettingsSectionDescription>
                        {t("rulesResourcePolicyDescription")}
                    </SettingsSectionDescription>
                </SettingsSectionHeader>
                <SettingsSectionBody>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsOpen(true)}
                    >
                        <Plus className="mr-2 h-4 w-4" />
                        {t("resourcePolicyRulesAdd")}
                    </Button>
                </SettingsSectionBody>
            </SettingsSection>
        );
    }

    return (
        <SettingsSection>
            <SettingsSectionHeader>
                <SettingsSectionTitle>
                    {t("rulesResource")}
                </SettingsSectionTitle>
                <SettingsSectionDescription>
                    {t("rulesResourceDescription")}
                </SettingsSectionDescription>
            </SettingsSectionHeader>
            <SettingsSectionBody>
                <div className="space-y-6">
                    <div className="flex items-center space-x-2">
                        <SwitchInput
                            id="rules-toggle"
                            label={t("rulesEnable")}
                            defaultChecked={false}
                            onCheckedChange={(val) => {
                                setRulesEnabled(val);
                                form.setValue("applyRules", val);
                            }}
                        />
                    </div>

                    <Form {...addRuleForm}>
                        <form
                            onSubmit={addRuleForm.handleSubmit(addRule)}
                            className="space-y-4"
                        >
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
                                <FormField
                                    control={addRuleForm.control}
                                    name="action"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                {t("rulesAction")}
                                            </FormLabel>
                                            <FormControl>
                                                <Select
                                                    value={field.value}
                                                    onValueChange={
                                                        field.onChange
                                                    }
                                                >
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="ACCEPT">
                                                            {RuleAction.ACCEPT}
                                                        </SelectItem>
                                                        <SelectItem value="DROP">
                                                            {RuleAction.DROP}
                                                        </SelectItem>
                                                        <SelectItem value="PASS">
                                                            {RuleAction.PASS}
                                                        </SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={addRuleForm.control}
                                    name="match"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                {t("rulesMatchType")}
                                            </FormLabel>
                                            <FormControl>
                                                <Select
                                                    value={field.value}
                                                    onValueChange={
                                                        field.onChange
                                                    }
                                                >
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="PATH">
                                                            {RuleMatch.PATH}
                                                        </SelectItem>
                                                        <SelectItem value="IP">
                                                            {RuleMatch.IP}
                                                        </SelectItem>
                                                        <SelectItem value="CIDR">
                                                            {RuleMatch.CIDR}
                                                        </SelectItem>
                                                        {isMaxmindAvailable && (
                                                            <SelectItem value="COUNTRY">
                                                                {
                                                                    RuleMatch.COUNTRY
                                                                }
                                                            </SelectItem>
                                                        )}
                                                        {isMaxmindAsnAvailable && (
                                                            <SelectItem value="ASN">
                                                                {RuleMatch.ASN}
                                                            </SelectItem>
                                                        )}
                                                    </SelectContent>
                                                </Select>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={addRuleForm.control}
                                    name="value"
                                    render={({ field }) => (
                                        <FormItem className="gap-1">
                                            <InfoPopup
                                                text={t("value")}
                                                info={
                                                    getValueHelpText(
                                                        addRuleForm.watch(
                                                            "match"
                                                        )
                                                    ) || ""
                                                }
                                            />
                                            <FormControl>
                                                {addRuleForm.watch("match") ===
                                                "COUNTRY" ? (
                                                    <Popover
                                                        open={
                                                            openAddRuleCountrySelect
                                                        }
                                                        onOpenChange={
                                                            setOpenAddRuleCountrySelect
                                                        }
                                                    >
                                                        <PopoverTrigger asChild>
                                                            <Button
                                                                variant="outline"
                                                                role="combobox"
                                                                aria-expanded={
                                                                    openAddRuleCountrySelect
                                                                }
                                                                className="w-full justify-between"
                                                            >
                                                                {field.value
                                                                    ? COUNTRIES.find(
                                                                          (c) =>
                                                                              c.code ===
                                                                              field.value
                                                                      )?.name +
                                                                      " (" +
                                                                      field.value +
                                                                      ")"
                                                                    : t(
                                                                          "selectCountry"
                                                                      )}
                                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                            </Button>
                                                        </PopoverTrigger>
                                                        <PopoverContent className="w-full p-0">
                                                            <Command>
                                                                <CommandInput
                                                                    placeholder={t(
                                                                        "searchCountries"
                                                                    )}
                                                                />
                                                                <CommandList>
                                                                    <CommandEmpty>
                                                                        {t(
                                                                            "noCountryFound"
                                                                        )}
                                                                    </CommandEmpty>
                                                                    <CommandGroup>
                                                                        {COUNTRIES.map(
                                                                            (
                                                                                country
                                                                            ) => (
                                                                                <CommandItem
                                                                                    key={
                                                                                        country.code
                                                                                    }
                                                                                    value={
                                                                                        country.name
                                                                                    }
                                                                                    onSelect={() => {
                                                                                        field.onChange(
                                                                                            country.code
                                                                                        );
                                                                                        setOpenAddRuleCountrySelect(
                                                                                            false
                                                                                        );
                                                                                    }}
                                                                                >
                                                                                    <Check
                                                                                        className={`mr-2 h-4 w-4 ${field.value === country.code ? "opacity-100" : "opacity-0"}`}
                                                                                    />
                                                                                    {
                                                                                        country.name
                                                                                    }{" "}
                                                                                    (
                                                                                    {
                                                                                        country.code
                                                                                    }

                                                                                    )
                                                                                </CommandItem>
                                                                            )
                                                                        )}
                                                                    </CommandGroup>
                                                                </CommandList>
                                                            </Command>
                                                        </PopoverContent>
                                                    </Popover>
                                                ) : addRuleForm.watch(
                                                      "match"
                                                  ) === "ASN" ? (
                                                    <Popover
                                                        open={
                                                            openAddRuleAsnSelect
                                                        }
                                                        onOpenChange={
                                                            setOpenAddRuleAsnSelect
                                                        }
                                                    >
                                                        <PopoverTrigger asChild>
                                                            <Button
                                                                variant="outline"
                                                                role="combobox"
                                                                aria-expanded={
                                                                    openAddRuleAsnSelect
                                                                }
                                                                className="w-full justify-between"
                                                            >
                                                                {field.value
                                                                    ? MAJOR_ASNS.find(
                                                                          (
                                                                              asn
                                                                          ) =>
                                                                              asn.code ===
                                                                              field.value
                                                                      )?.name +
                                                                          " (" +
                                                                          field.value +
                                                                          ")" ||
                                                                      field.value
                                                                    : "Select ASN"}
                                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                            </Button>
                                                        </PopoverTrigger>
                                                        <PopoverContent className="w-full p-0">
                                                            <Command>
                                                                <CommandInput placeholder="Search ASNs or enter custom..." />
                                                                <CommandList>
                                                                    <CommandEmpty>
                                                                        No ASN
                                                                        found.
                                                                        Use the
                                                                        custom
                                                                        input
                                                                        below.
                                                                    </CommandEmpty>
                                                                    <CommandGroup>
                                                                        {MAJOR_ASNS.map(
                                                                            (
                                                                                asn
                                                                            ) => (
                                                                                <CommandItem
                                                                                    key={
                                                                                        asn.code
                                                                                    }
                                                                                    value={
                                                                                        asn.name +
                                                                                        " " +
                                                                                        asn.code
                                                                                    }
                                                                                    onSelect={() => {
                                                                                        field.onChange(
                                                                                            asn.code
                                                                                        );
                                                                                        setOpenAddRuleAsnSelect(
                                                                                            false
                                                                                        );
                                                                                    }}
                                                                                >
                                                                                    <Check
                                                                                        className={`mr-2 h-4 w-4 ${field.value === asn.code ? "opacity-100" : "opacity-0"}`}
                                                                                    />
                                                                                    {
                                                                                        asn.name
                                                                                    }{" "}
                                                                                    (
                                                                                    {
                                                                                        asn.code
                                                                                    }

                                                                                    )
                                                                                </CommandItem>
                                                                            )
                                                                        )}
                                                                    </CommandGroup>
                                                                </CommandList>
                                                            </Command>
                                                            <div className="border-t p-2">
                                                                <Input
                                                                    placeholder="Enter custom ASN (e.g., AS15169)"
                                                                    onKeyDown={(
                                                                        e
                                                                    ) => {
                                                                        if (
                                                                            e.key ===
                                                                            "Enter"
                                                                        ) {
                                                                            const value =
                                                                                e.currentTarget.value
                                                                                    .toUpperCase()
                                                                                    .replace(
                                                                                        /^AS/,
                                                                                        ""
                                                                                    );
                                                                            if (
                                                                                /^\d+$/.test(
                                                                                    value
                                                                                )
                                                                            ) {
                                                                                field.onChange(
                                                                                    "AS" +
                                                                                        value
                                                                                );
                                                                                setOpenAddRuleAsnSelect(
                                                                                    false
                                                                                );
                                                                            }
                                                                        }
                                                                    }}
                                                                    className="text-sm"
                                                                />
                                                            </div>
                                                        </PopoverContent>
                                                    </Popover>
                                                ) : (
                                                    <Input {...field} />
                                                )}
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <Button
                                    type="submit"
                                    variant="outline"
                                    disabled={!rulesEnabled}
                                >
                                    {t("ruleSubmit")}
                                </Button>
                            </div>
                        </form>
                    </Form>

                    <Table>
                        <TableHeader>
                            {table.getHeaderGroups().map((headerGroup) => (
                                <TableRow key={headerGroup.id}>
                                    {headerGroup.headers.map((header) => {
                                        const isActionsColumn =
                                            header.column.id === "actions";
                                        return (
                                            <TableHead
                                                key={header.id}
                                                className={
                                                    isActionsColumn
                                                        ? "sticky right-0 z-10 w-auto min-w-fit bg-card"
                                                        : ""
                                                }
                                            >
                                                {header.isPlaceholder
                                                    ? null
                                                    : flexRender(
                                                          header.column
                                                              .columnDef.header,
                                                          header.getContext()
                                                      )}
                                            </TableHead>
                                        );
                                    })}
                                </TableRow>
                            ))}
                        </TableHeader>
                        <TableBody>
                            {table.getRowModel().rows?.length ? (
                                table.getRowModel().rows.map((row) => (
                                    <TableRow key={row.id}>
                                        {row.getVisibleCells().map((cell) => {
                                            const isActionsColumn =
                                                cell.column.id === "actions";
                                            return (
                                                <TableCell
                                                    key={cell.id}
                                                    className={
                                                        isActionsColumn
                                                            ? "sticky right-0 z-10 w-auto min-w-fit bg-card"
                                                            : ""
                                                    }
                                                >
                                                    {flexRender(
                                                        cell.column.columnDef
                                                            .cell,
                                                        cell.getContext()
                                                    )}
                                                </TableCell>
                                            );
                                        })}
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell
                                        colSpan={columns.length}
                                        className="h-24 text-center"
                                    >
                                        {t("rulesNoOne")}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </SettingsSectionBody>
        </SettingsSection>
    );
}
