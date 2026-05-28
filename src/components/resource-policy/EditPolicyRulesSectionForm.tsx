"use client";

import {
    SettingsSection,
    SettingsSectionBody,
    SettingsSectionDescription,
    SettingsSectionFooter,
    SettingsSectionHeader,
    SettingsSectionTitle
} from "@app/components/Settings";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";

import z from "zod";

import { toast } from "@app/hooks/useToast";
import { createPolicySchema, type PolicyFormValues } from ".";

import { SwitchInput } from "@app/components/SwitchInput";
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
    Check,
    ChevronsUpDown,
    LockIcon,
    Plus
} from "lucide-react";

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    useTransition
} from "react";
import { UseFormReturn, useForm, useWatch } from "react-hook-form";
import { useResourcePolicyContext } from "@app/providers/ResourcePolicyProvider";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { resourceQueries } from "@app/lib/queries";
import { useQuery } from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import { useRouter } from "next/navigation";

// ─── PolicyRulesSection ───────────────────────────────────────────────────────

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
    fromPolicy?: boolean;
};

type PolicyRulesSectionProps = {
    isMaxmindAvailable: boolean;
    isMaxmindAsnAvailable: boolean;
    readonly?: boolean;
    resourceId?: number;
};

export function EditPolicyRulesSectionForm({
    isMaxmindAvailable,
    isMaxmindAsnAvailable,
    readonly,
    resourceId
}: PolicyRulesSectionProps) {
    const t = useTranslations();

    const { policy } = useResourcePolicyContext();
    const api = createApiClient(useEnvContext());
    const router = useRouter();

    const isResourceOverlay = resourceId !== undefined;

    // ── Fetch resource-specific rules when in overlay mode ───────────────────
    const { data: resourceRulesData } = useQuery({
        ...resourceQueries.resourceRules({ resourceId: resourceId! }),
        enabled: isResourceOverlay
    });

    const deletedResourceRuleIdsRef = useRef<Set<number>>(new Set());
    const [resourceRulesInitialized, setResourceRulesInitialized] =
        useState(false);

    const form = useForm({
        resolver: zodResolver(
            createPolicySchema.pick({
                rules: true,
                applyRules: true
            })
        ),
        defaultValues: {
            applyRules: policy.applyRules,
            rules: policy.rules
        }
    });

    const rulesEnabled = useWatch({
        control: form.control,
        name: "applyRules"
    });

    const [rules, setRules] = useState<LocalRule[]>(
        policy.rules.map((r) => ({ ...r, fromPolicy: !isResourceOverlay }))
    );
    const [isExpanded, setIsExpanded] = useState(
        rulesEnabled || isResourceOverlay
    );

    // Initialize resource-specific rules once fetched
    useEffect(() => {
        if (!isResourceOverlay || resourceRulesInitialized) return;
        if (!resourceRulesData) return;

        const policyRuleIds = new Set(policy.rules.map((r) => r.ruleId));
        const resourceSpecific: LocalRule[] = resourceRulesData
            .filter((r) => !policyRuleIds.has(r.ruleId))
            .map((r) => ({
                ruleId: r.ruleId,
                action: r.action as "ACCEPT" | "DROP" | "PASS",
                match: r.match,
                value: r.value,
                priority: r.priority,
                enabled: r.enabled,
                fromPolicy: false
            }));

        setRules([
            ...policy.rules.map((r) => ({ ...r, fromPolicy: true })),
            ...resourceSpecific
        ]);
        setResourceRulesInitialized(true);
    }, [
        isResourceOverlay,
        resourceRulesData,
        resourceRulesInitialized,
        policy.rules
    ]);

    const [openAddRuleCountrySelect, setOpenAddRuleCountrySelect] =
        useState(false);
    const [openAddRuleAsnSelect, setOpenAddRuleAsnSelect] = useState(false);

    const addRuleForm = useForm({
        resolver: zodResolver(addRuleSchema),
        defaultValues: {
            action: "ACCEPT" as const,
            match: "PATH",
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
            const rule = rules.find((r) => r.ruleId === ruleId);
            if (!rule || rule.fromPolicy) return; // cannot remove policy rules
            // Track deletion for resource overlay mode (only for existing DB rules)
            if (isResourceOverlay && !rule.new) {
                deletedResourceRuleIdsRef.current.add(ruleId);
            }
            const updatedRules = rules.filter((rule) => rule.ruleId !== ruleId);
            setRules(updatedRules);
            syncFormRules(updatedRules);
        },
        [rules, syncFormRules, isResourceOverlay]
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
                cell: ({ row }) => {
                    const isLocked = row.original.fromPolicy;
                    if (isLocked) {
                        return (
                            <span className="px-3 text-muted-foreground">
                                &mdash;
                            </span>
                        );
                    }
                    return (
                        <Input
                            defaultValue={row.original.priority}
                            className="w-[75px]"
                            type="number"
                            disabled={readonly}
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
                    );
                }
            },
            {
                accessorKey: "action",
                header: () => <span className="p-3">{t("rulesAction")}</span>,
                cell: ({ row }) => (
                    <Select
                        defaultValue={row.original.action}
                        disabled={readonly || row.original.fromPolicy}
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
                        disabled={readonly || row.original.fromPolicy}
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
                                    disabled={
                                        readonly || row.original.fromPolicy
                                    }
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
                                    disabled={
                                        readonly || row.original.fromPolicy
                                    }
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
                            disabled={readonly || row.original.fromPolicy}
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
                        disabled={readonly || row.original.fromPolicy}
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
                        {row.original.fromPolicy ? (
                            <Button
                                variant="outline"
                                disabled
                                className="cursor-not-allowed"
                            >
                                <LockIcon className="h-4 w-4" />
                            </Button>
                        ) : (
                            <Button
                                variant="outline"
                                disabled={readonly}
                                onClick={() => removeRule(row.original.ruleId)}
                            >
                                {t("delete")}
                            </Button>
                        )}
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
            removeRule,
            readonly
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

    const [isPending, startTransition] = useTransition();

    async function saveRules() {
        if (readonly) return;

        if (isResourceOverlay) {
            await saveResourceOverlayRules();
            return;
        }

        const isValid = form.trigger();
        if (!isValid) return;

        const payload = form.getValues();

        try {
            const res = await api
                .put<
                    AxiosResponse<{}>
                >(`/resource-policy/${policy.resourcePolicyId}/rules`, payload)
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

    async function saveResourceOverlayRules() {
        try {
            const newRules = rules.filter((r) => !r.fromPolicy && r.new);
            const updatedRules = rules.filter(
                (r) => !r.fromPolicy && !r.new && r.updated
            );
            const deletedIds = [...deletedResourceRuleIdsRef.current];

            await Promise.all([
                ...newRules.map((r) =>
                    api.put(`/resource/${resourceId}/rule`, {
                        action: r.action,
                        match: r.match,
                        value: r.value,
                        priority: r.priority,
                        enabled: r.enabled
                    })
                ),
                ...updatedRules.map((r) =>
                    api.post(`/resource/${resourceId}/rule/${r.ruleId}`, {
                        action: r.action,
                        match: r.match,
                        value: r.value,
                        priority: r.priority,
                        enabled: r.enabled
                    })
                ),
                ...deletedIds.map((id) =>
                    api.delete(`/resource/${resourceId}/rule/${id}`)
                )
            ]);

            deletedResourceRuleIdsRef.current = new Set();

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
        }
    }

    if (!isExpanded) {
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
                    {!readonly ? (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsExpanded(true)}
                        >
                            <Plus className="mr-2 h-4 w-4" />
                            {t("resourcePolicyRulesAdd")}
                        </Button>
                    ) : (
                        <div className="text-muted-foreground flex items-center h-full size-full bg-muted rounded-md px-8 py-6 border-dashed text-sm">
                            <p>{t("resourcePolicyRulesEmpty")}</p>
                        </div>
                    )}
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
                            defaultChecked={rulesEnabled}
                            onCheckedChange={(val) => {
                                form.setValue("applyRules", val);
                            }}
                            disabled={readonly || isResourceOverlay}
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
                                                    disabled={
                                                        readonly ||
                                                        (!isResourceOverlay &&
                                                            !rulesEnabled)
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
                                                    disabled={
                                                        readonly ||
                                                        (!isResourceOverlay &&
                                                            !rulesEnabled)
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
                                                                disabled={
                                                                    readonly ||
                                                                    (!isResourceOverlay &&
                                                                        !rulesEnabled)
                                                                }
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
                                                                disabled={
                                                                    readonly ||
                                                                    (!isResourceOverlay &&
                                                                        !rulesEnabled)
                                                                }
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
                                                    <Input
                                                        {...field}
                                                        disabled={
                                                            readonly ||
                                                            (!isResourceOverlay &&
                                                                !rulesEnabled)
                                                        }
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
                                    disabled={
                                        readonly ||
                                        (!isResourceOverlay && !rulesEnabled)
                                    }
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
            <SettingsSectionFooter>
                <Button
                    onClick={() => startTransition(() => saveRules())}
                    loading={isPending}
                    disabled={readonly || isPending}
                >
                    {t("rulesSave")}
                </Button>
            </SettingsSectionFooter>
        </SettingsSection>
    );
}
