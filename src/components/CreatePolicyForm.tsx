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
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useOrgContext } from "@app/hooks/useOrgContext";
import { usePaidStatus } from "@app/hooks/usePaidStatus";
import { toast } from "@app/hooks/useToast";
import { createApiClient } from "@app/lib/api";
import { getUserDisplayName } from "@app/lib/getUserDisplayName";
import { orgQueries } from "@app/lib/queries";
import { zodResolver } from "@hookform/resolvers/zod";
import { build } from "@server/build";
import { MAJOR_ASNS } from "@server/db/asns";
import { COUNTRIES } from "@server/db/countries";
import { tierMatrix } from "@server/lib/billing/tierMatrix";
import {
    isValidCIDR,
    isValidIP,
    isValidUrlGlobPattern
} from "@server/lib/validators";
import { UserType } from "@server/types/UserTypes";
import { useQuery } from "@tanstack/react-query";
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
    Key
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useActionState, useCallback, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import z from "zod";

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
    ),
    applyRules: z.boolean().default(false),
    rules: z
        .array(
            z.object({
                action: z.enum(["ACCEPT", "DROP", "PASS"]),
                match: z.string(),
                value: z.string(),
                priority: z.number().int(),
                enabled: z.boolean()
            })
        )
        .default([])
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

    const isMaxmindAvailable =
        env.server.maxmind_db_path && env.server.maxmind_db_path.length > 0;
    const isMaxmindAsnAvailable =
        env.server.maxmind_asn_path && env.server.maxmind_asn_path.length > 0;

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
            emails: [],
            applyRules: false,
            rules: []
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

    // Rules state
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

    const RuleAction = useMemo(() => {
        return {
            ACCEPT: t("alwaysAllow"),
            DROP: t("alwaysDeny"),
            PASS: t("passToAuth")
        } as const;
    }, [t]);

    const RuleMatch = useMemo(() => {
        return {
            PATH: t("path"),
            IP: "IP",
            CIDR: t("ipAddressRange"),
            COUNTRY: t("country"),
            ASN: "ASN"
        } as const;
    }, [t]);

    async function onSubmit() {
        // ...
    }

    const addRule = useCallback(function addRule(data: z.infer<typeof addRuleSchema>) {
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
            priority = rules.reduce(
                (acc, rule) => (rule.priority > acc ? rule.priority : acc),
                0
            );
            priority++;
        }

        const newRule: LocalRule = {
            ...data,
            ruleId: new Date().getTime(),
            new: true,
            priority,
            enabled: true
        };

        const updatedRules = [...rules, newRule];
        setRules(updatedRules);
        form.setValue(
            "rules",
            updatedRules.map(({ action, match, value, priority, enabled }) => ({
                action,
                match,
                value,
                priority,
                enabled
            }))
        );
        addRuleForm.reset();
    }, [rules, t, form, addRuleForm]);

    const removeRule = useCallback(function removeRule(ruleId: number) {
        const updatedRules = rules.filter((rule) => rule.ruleId !== ruleId);
        setRules(updatedRules);
        form.setValue(
            "rules",
            updatedRules.map(({ action, match, value, priority, enabled }) => ({
                action,
                match,
                value,
                priority,
                enabled
            }))
        );
    }, [rules, form]);

    const updateRule = useCallback(function updateRule(ruleId: number, data: Partial<LocalRule>) {
        const updatedRules = rules.map((rule) =>
            rule.ruleId === ruleId ? { ...rule, ...data, updated: true } : rule
        );
        setRules(updatedRules);
        form.setValue(
            "rules",
            updatedRules.map(({ action, match, value, priority, enabled }) => ({
                action,
                match,
                value,
                priority,
                enabled
            }))
        );
    }, [rules, form]);

    const getValueHelpText = useCallback(function getValueHelpText(type: string) {
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
    }, [t]);

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
                                              (country) =>
                                                  country.code ===
                                                  row.original.value
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
                                                    onSelect={() => {
                                                        updateRule(
                                                            row.original.ruleId,
                                                            {
                                                                value: country.code
                                                            }
                                                        );
                                                    }}
                                                >
                                                    <Check
                                                        className={`mr-2 h-4 w-4 ${
                                                            row.original
                                                                .value ===
                                                            country.code
                                                                ? "opacity-100"
                                                                : "opacity-0"
                                                        }`}
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
                                                    onSelect={() => {
                                                        updateRule(
                                                            row.original.ruleId,
                                                            { value: asn.code }
                                                        );
                                                    }}
                                                >
                                                    <Check
                                                        className={`mr-2 h-4 w-4 ${
                                                            row.original
                                                                .value ===
                                                            asn.code
                                                                ? "opacity-100"
                                                                : "opacity-0"
                                                        }`}
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
        state: {
            pagination: {
                pageIndex: 0,
                pageSize: 1000
            }
        }
    });

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
                    </SettingsSection>

                    {/* Rules */}
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
                                        onSubmit={addRuleForm.handleSubmit(
                                            addRule
                                        )}
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
                                                                value={
                                                                    field.value
                                                                }
                                                                onValueChange={
                                                                    field.onChange
                                                                }
                                                            >
                                                                <SelectTrigger className="w-full">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="ACCEPT">
                                                                        {
                                                                            RuleAction.ACCEPT
                                                                        }
                                                                    </SelectItem>
                                                                    <SelectItem value="DROP">
                                                                        {
                                                                            RuleAction.DROP
                                                                        }
                                                                    </SelectItem>
                                                                    <SelectItem value="PASS">
                                                                        {
                                                                            RuleAction.PASS
                                                                        }
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
                                                            {t(
                                                                "rulesMatchType"
                                                            )}
                                                        </FormLabel>
                                                        <FormControl>
                                                            <Select
                                                                value={
                                                                    field.value
                                                                }
                                                                onValueChange={
                                                                    field.onChange
                                                                }
                                                            >
                                                                <SelectTrigger className="w-full">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="PATH">
                                                                        {
                                                                            RuleMatch.PATH
                                                                        }
                                                                    </SelectItem>
                                                                    <SelectItem value="IP">
                                                                        {
                                                                            RuleMatch.IP
                                                                        }
                                                                    </SelectItem>
                                                                    <SelectItem value="CIDR">
                                                                        {
                                                                            RuleMatch.CIDR
                                                                        }
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
                                                                            {
                                                                                RuleMatch.ASN
                                                                            }
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
                                                            {addRuleForm.watch(
                                                                "match"
                                                            ) === "COUNTRY" ? (
                                                                <Popover
                                                                    open={
                                                                        openAddRuleCountrySelect
                                                                    }
                                                                    onOpenChange={
                                                                        setOpenAddRuleCountrySelect
                                                                    }
                                                                >
                                                                    <PopoverTrigger
                                                                        asChild
                                                                    >
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
                                                                                      (
                                                                                          country
                                                                                      ) =>
                                                                                          country.code ===
                                                                                          field.value
                                                                                  )
                                                                                      ?.name +
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
                                                                                                    className={`mr-2 h-4 w-4 ${
                                                                                                        field.value ===
                                                                                                        country.code
                                                                                                            ? "opacity-100"
                                                                                                            : "opacity-0"
                                                                                                    }`}
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
                                                                    <PopoverTrigger
                                                                        asChild
                                                                    >
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
                                                                                  )
                                                                                      ?.name +
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
                                                                                    No
                                                                                    ASN
                                                                                    found.
                                                                                    Use
                                                                                    the
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
                                                                                                    className={`mr-2 h-4 w-4 ${
                                                                                                        field.value ===
                                                                                                        asn.code
                                                                                                            ? "opacity-100"
                                                                                                            : "opacity-0"
                                                                                                    }`}
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
                                                                <Input
                                                                    {...field}
                                                                />
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
                                        {table
                                            .getHeaderGroups()
                                            .map((headerGroup) => (
                                                <TableRow key={headerGroup.id}>
                                                    {headerGroup.headers.map(
                                                        (header) => {
                                                            const isActionsColumn =
                                                                header.column
                                                                    .id ===
                                                                "actions";
                                                            return (
                                                                <TableHead
                                                                    key={
                                                                        header.id
                                                                    }
                                                                    className={
                                                                        isActionsColumn
                                                                            ? "sticky right-0 z-10 w-auto min-w-fit bg-card"
                                                                            : ""
                                                                    }
                                                                >
                                                                    {header.isPlaceholder
                                                                        ? null
                                                                        : flexRender(
                                                                              header
                                                                                  .column
                                                                                  .columnDef
                                                                                  .header,
                                                                              header.getContext()
                                                                          )}
                                                                </TableHead>
                                                            );
                                                        }
                                                    )}
                                                </TableRow>
                                            ))}
                                    </TableHeader>
                                    <TableBody>
                                        {table.getRowModel().rows?.length ? (
                                            table
                                                .getRowModel()
                                                .rows.map((row) => (
                                                    <TableRow key={row.id}>
                                                        {row
                                                            .getVisibleCells()
                                                            .map((cell) => {
                                                                const isActionsColumn =
                                                                    cell.column
                                                                        .id ===
                                                                    "actions";
                                                                return (
                                                                    <TableCell
                                                                        key={
                                                                            cell.id
                                                                        }
                                                                        className={
                                                                            isActionsColumn
                                                                                ? "sticky right-0 z-10 w-auto min-w-fit bg-card"
                                                                                : ""
                                                                        }
                                                                    >
                                                                        {flexRender(
                                                                            cell
                                                                                .column
                                                                                .columnDef
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
