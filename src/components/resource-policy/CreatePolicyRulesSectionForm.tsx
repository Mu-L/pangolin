"use client";

import {
    SettingsSection,
    SettingsSectionBody,
    SettingsSectionDescription,
    SettingsSectionHeader,
    SettingsSectionTitle
} from "@app/components/Settings";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";

import z from "zod";

import { createPolicySchema, type PolicyFormValues } from ".";
import { toast } from "@app/hooks/useToast";

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
    Plus
} from "lucide-react";

import { useCallback, useEffect, useMemo, useState } from "react";
import { type UseFormReturn, useForm, useWatch } from "react-hook-form";

// ─── CreatePolicyRulesSectionForm ─────────────────────────────────────────────

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

export type CreatePolicyRulesSectionFormProps = {
    form: UseFormReturn<PolicyFormValues, any, any>;
    isMaxmindAvailable: boolean;
    isMaxmindAsnAvailable: boolean;
};

export function CreatePolicyRulesSectionForm({
    form: parentForm,
    isMaxmindAvailable,
    isMaxmindAsnAvailable
}: CreatePolicyRulesSectionFormProps) {
    const t = useTranslations();
    const [isExpanded, setIsExpanded] = useState(false);
    const [rules, setRules] = useState<LocalRule[]>([]);
    const [openAddRuleCountrySelect, setOpenAddRuleCountrySelect] =
        useState(false);
    const [openAddRuleAsnSelect, setOpenAddRuleAsnSelect] = useState(false);

    const form = useForm({
        resolver: zodResolver(
            createPolicySchema.pick({
                applyRules: true,
                rules: true
            })
        ),
        defaultValues: {
            applyRules: false,
            rules: []
        }
    });

    useEffect(() => {
        const subscription = form.watch((values) => {
            parentForm.setValue("applyRules", values.applyRules as boolean);
            parentForm.setValue("rules", values.rules as any);
        });
        return () => subscription.unsubscribe();
    }, [form, parentForm]);

    const rulesEnabled = useWatch({
        control: form.control,
        name: "applyRules"
    });

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
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsExpanded(true)}
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
