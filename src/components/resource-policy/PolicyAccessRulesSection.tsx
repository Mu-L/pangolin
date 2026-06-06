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

import { toast } from "@app/hooks/useToast";
import {
    createPolicyRulesSectionSchema,
    validatePolicyRulePriority,
    validatePolicyRuleValue,
    validatePolicyRulesForSave,
    type PolicyFormValues
} from ".";

import { Button } from "@app/components/ui/button";
import { DataTableEmptyState } from "@app/components/ui/data-table-empty-state";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList
} from "@app/components/ui/command";
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
import { REGIONS, getRegionNameById } from "@server/db/regions";
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
import { CreatePolicyRulesSectionForm } from "./CreatePolicyRulesSectionForm";
import { PolicyAccessRulesIntro } from "./PolicyAccessRulesIntro";
import { createEmptyRule } from "./policy-access-rule-utils";

// ─── PolicyRulesSection ───────────────────────────────────────────────────────

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

type PolicyAccessRulesSectionEditProps = {
    mode: "edit";
    isMaxmindAvailable: boolean;
    isMaxmindAsnAvailable: boolean;
    readonly?: boolean;
    resourceId?: number;
};

type PolicyAccessRulesSectionCreateProps = {
    mode: "create";
    form: UseFormReturn<PolicyFormValues, any, any>;
    isMaxmindAvailable: boolean;
    isMaxmindAsnAvailable: boolean;
};

export type PolicyAccessRulesSectionProps =
    | PolicyAccessRulesSectionEditProps
    | PolicyAccessRulesSectionCreateProps;

export function PolicyAccessRulesSection(props: PolicyAccessRulesSectionProps) {
    if (props.mode === "create") {
        return <PolicyAccessRulesSectionCreate {...props} />;
    }
    return <PolicyAccessRulesSectionEdit {...props} />;
}

function PolicyAccessRulesSectionEdit({
    isMaxmindAvailable,
    isMaxmindAsnAvailable,
    readonly,
    resourceId
}: PolicyAccessRulesSectionEditProps) {
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

    const rulesFormSchema = useMemo(
        () => createPolicyRulesSectionSchema(t),
        [t]
    );

    const form = useForm({
        resolver: zodResolver(rulesFormSchema),
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
        policy.rules.map((r) => ({ ...r, fromPolicy: isResourceOverlay }))
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
            ...resourceSpecific,
            ...policy.rules.map((r) => ({ ...r, fromPolicy: true }))
        ]);
        setResourceRulesInitialized(true);
    }, [
        isResourceOverlay,
        resourceRulesData,
        resourceRulesInitialized,
        policy.rules
    ]);

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
            ASN: "ASN",
            REGION: t("region")
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

    const addEmptyRule = useCallback(() => {
        const updatedRules = [...rules, createEmptyRule(rules)];
        setRules(updatedRules);
        syncFormRules(updatedRules);
    }, [rules, syncFormRules]);

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

    const sortedRules = useMemo(
        () => [...rules].sort((a, b) => a.priority - b.priority),
        [rules]
    );

    const columns: ColumnDef<LocalRule>[] = useMemo(
        () => [
            {
                accessorKey: "priority",
                size: 96,
                maxSize: 96,
                header: ({ column }) => (
                    <div className="p-3">
                        <Button
                            variant="ghost"
                            className="h-auto p-0 font-medium text-muted-foreground hover:bg-transparent"
                            onClick={() =>
                                column.toggleSorting(
                                    column.getIsSorted() === "asc"
                                )
                            }
                        >
                            {t("rulesPriority")}
                            <ArrowUpDown className="ml-1 h-3 w-3" />
                        </Button>
                    </div>
                ),
                cell: ({ row }) => (
                    <Input
                        defaultValue={row.original.priority}
                        className="w-full min-w-0"
                        type="number"
                        disabled={readonly || row.original.fromPolicy}
                        onClick={(e) => e.currentTarget.focus()}
                        onBlur={(e) => {
                            const validated = validatePolicyRulePriority(
                                t,
                                e.target.value
                            );
                            if (!validated.success) {
                                toast({
                                    variant: "destructive",
                                    ...validated.toast
                                });
                                return;
                            }
                            const duplicatePriority = rules.some(
                                (rule) =>
                                    rule.ruleId !== row.original.ruleId &&
                                    rule.priority === validated.data
                            );
                            if (duplicatePriority) {
                                toast({
                                    variant: "destructive",
                                    title: t("rulesErrorDuplicatePriority"),
                                    description: t(
                                        "rulesErrorDuplicatePriorityDescription"
                                    )
                                });
                                return;
                            }
                            updateRule(row.original.ruleId, {
                                priority: validated.data
                            });
                        }}
                    />
                )
            },
            {
                accessorKey: "action",
                size: 160,
                maxSize: 160,
                header: () => <span className="p-3">{t("rulesAction")}</span>,
                cell: ({ row }) => (
                    <Select
                        defaultValue={row.original.action}
                        disabled={readonly || row.original.fromPolicy}
                        onValueChange={(value: "ACCEPT" | "DROP" | "PASS") =>
                            updateRule(row.original.ruleId, {
                                action: value
                            })
                        }
                    >
                        <SelectTrigger className="h-8 w-full min-w-0">
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
                size: 144,
                maxSize: 144,
                header: () => (
                    <span className="p-3">{t("rulesMatchType")}</span>
                ),
                cell: ({ row }) => (
                    <Select
                        defaultValue={row.original.match}
                        disabled={readonly || row.original.fromPolicy}
                        onValueChange={(
                            value:
                                | "CIDR"
                                | "IP"
                                | "PATH"
                                | "COUNTRY"
                                | "ASN"
                                | "REGION"
                        ) =>
                            updateRule(row.original.ruleId, {
                                match: value,
                                value:
                                    value === "COUNTRY"
                                        ? "US"
                                        : value === "ASN"
                                          ? "AS15169"
                                          : value === "REGION"
                                            ? "021"
                                            : row.original.value
                            })
                        }
                    >
                        <SelectTrigger className="h-8 w-full min-w-0">
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
                            {isMaxmindAvailable && (
                                <SelectItem value="REGION">
                                    {RuleMatch.REGION}
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
                    ) : row.original.match === "REGION" ? (
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
                                    {(() => {
                                        const regionName = getRegionNameById(
                                            row.original.value
                                        );
                                        if (!regionName) {
                                            return t("selectRegion");
                                        }
                                        return `${t(regionName)} (${row.original.value})`;
                                    })()}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="min-w-50 p-0">
                                <Command>
                                    <CommandInput
                                        placeholder={t("searchRegions")}
                                    />
                                    <CommandList>
                                        <CommandEmpty>
                                            {t("noRegionFound")}
                                        </CommandEmpty>
                                        {REGIONS.map((continent) => (
                                            <CommandGroup
                                                key={continent.id}
                                                heading={t(continent.name)}
                                            >
                                                <CommandItem
                                                    value={continent.id}
                                                    keywords={[
                                                        t(continent.name),
                                                        continent.id
                                                    ]}
                                                    onSelect={() =>
                                                        updateRule(
                                                            row.original.ruleId,
                                                            {
                                                                value: continent.id
                                                            }
                                                        )
                                                    }
                                                >
                                                    <Check
                                                        className={`mr-2 h-4 w-4 ${
                                                            row.original
                                                                .value ===
                                                            continent.id
                                                                ? "opacity-100"
                                                                : "opacity-0"
                                                        }`}
                                                    />
                                                    {t(continent.name)} (
                                                    {continent.id})
                                                </CommandItem>
                                                {continent.includes.map(
                                                    (subregion) => (
                                                        <CommandItem
                                                            key={subregion.id}
                                                            value={subregion.id}
                                                            keywords={[
                                                                t(
                                                                    subregion.name
                                                                ),
                                                                subregion.id
                                                            ]}
                                                            onSelect={() =>
                                                                updateRule(
                                                                    row.original
                                                                        .ruleId,
                                                                    {
                                                                        value: subregion.id
                                                                    }
                                                                )
                                                            }
                                                        >
                                                            <Check
                                                                className={`mr-2 h-4 w-4 ${
                                                                    row.original
                                                                        .value ===
                                                                    subregion.id
                                                                        ? "opacity-100"
                                                                        : "opacity-0"
                                                                }`}
                                                            />
                                                            {t(subregion.name)}{" "}
                                                            ({subregion.id})
                                                        </CommandItem>
                                                    )
                                                )}
                                            </CommandGroup>
                                        ))}
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    ) : (
                        <Input
                            defaultValue={row.original.value}
                            className="min-w-50"
                            disabled={readonly || row.original.fromPolicy}
                            onBlur={(e) => {
                                const validated = validatePolicyRuleValue(
                                    t,
                                    row.original.match,
                                    e.target.value
                                );
                                if (!validated.success) {
                                    toast({
                                        variant: "destructive",
                                        ...validated.toast
                                    });
                                    return;
                                }
                                updateRule(row.original.ruleId, {
                                    value: validated.data
                                });
                            }}
                        />
                    )
            },
            {
                accessorKey: "enabled",
                header: () => <span className="p-3">{t("enabled")}</span>,
                cell: ({ row }) => (
                    <div className="flex items-center w-full">
                        <Switch
                            defaultChecked={row.original.enabled}
                            disabled={readonly || row.original.fromPolicy}
                            onCheckedChange={(val) =>
                                updateRule(row.original.ruleId, {
                                    enabled: val
                                })
                            }
                        />
                    </div>
                )
            },
            {
                id: "actions",
                header: () => null,
                cell: ({ row }) => (
                    <div className="flex items-center justify-end space-x-2">
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
            readonly,
            rules
        ]
    );

    const table = useReactTable({
        data: sortedRules,
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

        const applyRules = form.getValues("applyRules") ?? false;
        const rulesPayload = rules.map(
            ({ action, match, value, priority, enabled }) => ({
                action,
                match,
                value,
                priority,
                enabled
            })
        );
        const validation = validatePolicyRulesForSave(
            t,
            rulesPayload,
            applyRules
        );
        if (!validation.success) {
            toast({
                variant: "destructive",
                ...validation.toast
            });
            return;
        }

        if (isResourceOverlay) {
            await saveResourceOverlayRules();
            return;
        }

        const isValid = await form.trigger();
        if (!isValid) return;

        const payload = {
            applyRules,
            rules: rulesPayload
        };

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

    const addRuleButton = (
        <Button
            type="button"
            variant="outline"
            disabled={readonly}
            onClick={addEmptyRule}
        >
            <Plus className="h-4 w-4 mr-2" />
            {t("ruleSubmit")}
        </Button>
    );

    return (
        <SettingsSection>
            <SettingsSectionHeader>
                <SettingsSectionTitle>
                    {t("policyAccessRulesTitle")}
                </SettingsSectionTitle>
                <SettingsSectionDescription>
                    {t("rulesResourceDescription")}
                </SettingsSectionDescription>
            </SettingsSectionHeader>
            <SettingsSectionBody>
                <div className="space-y-6">
                    <PolicyAccessRulesIntro
                        rulesEnabled={Boolean(rulesEnabled)}
                        onRulesEnabledChange={(val) => {
                            form.setValue("applyRules", val);
                        }}
                        disableToggle={readonly || isResourceOverlay}
                    />

                    {rulesEnabled && (
                        <>
                            <Table>
                                <TableHeader>
                                    {table
                                        .getHeaderGroups()
                                        .map((headerGroup) => (
                                            <TableRow key={headerGroup.id}>
                                                {headerGroup.headers.map(
                                                    (header) => {
                                                        const columnId =
                                                            header.column.id;
                                                        const isActionsColumn =
                                                            columnId ===
                                                            "actions";
                                                        const isPriorityColumn =
                                                            columnId ===
                                                            "priority";
                                                        const isActionColumn =
                                                            columnId ===
                                                            "action";
                                                        const isMatchColumn =
                                                            columnId ===
                                                            "match";
                                                        return (
                                                            <TableHead
                                                                key={header.id}
                                                                className={
                                                                    isActionsColumn
                                                                        ? "sticky right-0 z-10 w-[1%] min-w-fit bg-card text-right"
                                                                        : isPriorityColumn
                                                                          ? "w-24 max-w-24"
                                                                          : isActionColumn
                                                                            ? "w-40 max-w-40"
                                                                            : isMatchColumn
                                                                              ? "w-36 max-w-36"
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
                                        table.getRowModel().rows.map((row) => (
                                            <TableRow key={row.id}>
                                                {row
                                                    .getVisibleCells()
                                                    .map((cell) => {
                                                        const columnId =
                                                            cell.column.id;
                                                        const isActionsColumn =
                                                            columnId ===
                                                            "actions";
                                                        const isPriorityColumn =
                                                            columnId ===
                                                            "priority";
                                                        const isActionColumn =
                                                            columnId ===
                                                            "action";
                                                        const isMatchColumn =
                                                            columnId ===
                                                            "match";
                                                        return (
                                                            <TableCell
                                                                key={cell.id}
                                                                className={
                                                                    isActionsColumn
                                                                        ? "sticky right-0 z-10 w-[1%] min-w-fit bg-card text-right"
                                                                        : isPriorityColumn
                                                                          ? "w-24 max-w-24"
                                                                          : isActionColumn
                                                                            ? "w-40 max-w-40"
                                                                            : isMatchColumn
                                                                              ? "w-36 max-w-36"
                                                                              : ""
                                                                }
                                                            >
                                                                {flexRender(
                                                                    cell.column
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
                                        <DataTableEmptyState
                                            colSpan={columns.length}
                                            message={t("rulesNoOne")}
                                            action={addRuleButton}
                                        />
                                    )}
                                </TableBody>
                            </Table>
                            {table.getRowModel().rows?.length > 0 &&
                                addRuleButton}
                        </>
                    )}
                </div>
            </SettingsSectionBody>
            <SettingsSectionFooter>
                <Button
                    onClick={() => startTransition(() => saveRules())}
                    loading={isPending}
                    disabled={readonly || isPending}
                >
                    {t("saveSettings")}
                </Button>
            </SettingsSectionFooter>
        </SettingsSection>
    );
}

function PolicyAccessRulesSectionCreate({
    form,
    isMaxmindAvailable,
    isMaxmindAsnAvailable
}: PolicyAccessRulesSectionCreateProps) {
    return (
        <CreatePolicyRulesSectionForm
            form={form}
            isMaxmindAvailable={isMaxmindAvailable}
            isMaxmindAsnAvailable={isMaxmindAsnAvailable}
        />
    );
}
