"use client";

import { Button } from "@app/components/ui/button";
import { Checkbox } from "@app/components/ui/checkbox";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList
} from "@app/components/ui/command";
import {
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@app/components/ui/form";
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
import {
    RadioGroup,
    RadioGroupItem
} from "@app/components/ui/radio-group";
import { Label } from "@app/components/ui/label";
import { TagInput, type Tag } from "@app/components/tags/tag-input";
import { getUserDisplayName } from "@app/lib/getUserDisplayName";
import {
    type AlertRuleFormAction,
    type AlertRuleFormValues
} from "@app/lib/alertRuleForm";
import { orgQueries } from "@app/lib/queries";
import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import type { Control, UseFormReturn } from "react-hook-form";
import { useFormContext, useWatch } from "react-hook-form";
import { useDebounce } from "use-debounce";

export function DropdownAddAction({
    onAdd
}: {
    onAdd: (type: AlertRuleFormAction["type"]) => void;
}) {
    const t = useTranslations();
    const [open, setOpen] = useState(false);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    {t("alertingAddAction")}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-48" align="start">
                <Command>
                    <CommandList>
                        <CommandGroup>
                            <CommandItem
                                onSelect={() => {
                                    onAdd("notify");
                                    setOpen(false);
                                }}
                            >
                                {t("alertingActionNotify")}
                            </CommandItem>
                            <CommandItem
                                onSelect={() => {
                                    onAdd("webhook");
                                    setOpen(false);
                                }}
                            >
                                {t("alertingActionWebhook")}
                            </CommandItem>
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

function SiteMultiSelect({
    orgId,
    value,
    onChange
}: {
    orgId: string;
    value: number[];
    onChange: (v: number[]) => void;
}) {
    const t = useTranslations();
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");
    const [debounced] = useDebounce(q, 150);
    const { data: sites = [] } = useQuery(
        orgQueries.sites({ orgId, query: debounced, perPage: 500 })
    );
    const toggle = (id: number) => {
        if (value.includes(id)) {
            onChange(value.filter((x) => x !== id));
        } else {
            onChange([...value, id]);
        }
    };
    const summary =
        value.length === 0
            ? t("alertingSelectSites")
            : t("alertingSitesSelected", { count: value.length });
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                >
                    <span className="truncate">{summary}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder={t("siteSearch")}
                        value={q}
                        onValueChange={setQ}
                    />
                    <CommandList>
                        <CommandEmpty>{t("siteNotFound")}</CommandEmpty>
                        <CommandGroup>
                            {sites.map((s) => (
                                <CommandItem
                                    key={s.siteId}
                                    value={`${s.siteId}`}
                                    onSelect={() => toggle(s.siteId)}
                                    className="cursor-pointer"
                                >
                                    <Checkbox
                                        checked={value.includes(s.siteId)}
                                        className="mr-2 pointer-events-none"
                                    />
                                    {s.name}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

function HealthCheckMultiSelect({
    orgId,
    value,
    onChange
}: {
    orgId: string;
    value: number[];
    onChange: (v: number[]) => void;
}) {
    const t = useTranslations();
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");
    const [debounced] = useDebounce(q, 150);

    const { data: healthChecks = [] } = useQuery(
        orgQueries.healthChecks({ orgId })
    );

    const shown = useMemo(() => {
        const query = debounced.trim().toLowerCase();
        const base = query
            ? healthChecks.filter((hc) =>
                  hc.name.toLowerCase().includes(query)
              )
            : healthChecks;
        // Always keep already-selected items visible even if they fall outside the search
        if (query && value.length > 0) {
            const selectedNotInBase = healthChecks.filter(
                (hc) =>
                    value.includes(hc.targetHealthCheckId) &&
                    !base.some(
                        (b) => b.targetHealthCheckId === hc.targetHealthCheckId
                    )
            );
            return [...selectedNotInBase, ...base];
        }
        return base;
    }, [healthChecks, debounced, value]);

    const toggle = (id: number) => {
        if (value.includes(id)) {
            onChange(value.filter((x) => x !== id));
        } else {
            onChange([...value, id]);
        }
    };

    const summary =
        value.length === 0
            ? t("alertingSelectHealthChecks")
            : t("alertingHealthChecksSelected", { count: value.length });

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                >
                    <span className="truncate">{summary}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[var(--radix-popover-trigger-width)] p-0"
                align="start"
            >
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder={t("alertingSearchHealthChecks")}
                        value={q}
                        onValueChange={setQ}
                    />
                    <CommandList>
                        <CommandEmpty>
                            {t("alertingHealthChecksEmpty")}
                        </CommandEmpty>
                        <CommandGroup>
                            {shown.map((hc) => (
                                <CommandItem
                                    key={hc.targetHealthCheckId}
                                    value={`${hc.targetHealthCheckId}:${hc.name}`}
                                    onSelect={() =>
                                        toggle(hc.targetHealthCheckId)
                                    }
                                    className="cursor-pointer"
                                >
                                    <Checkbox
                                        checked={value.includes(
                                            hc.targetHealthCheckId
                                        )}
                                        className="mr-2 pointer-events-none shrink-0"
                                        aria-hidden
                                        tabIndex={-1}
                                    />
                                    <span className="truncate">
                                        {hc.name}
                                    </span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

export function ActionBlock({
    orgId,
    index,
    control,
    form,
    onRemove,
    canRemove
}: {
    orgId: string;
    index: number;
    control: Control<AlertRuleFormValues>;
    form: UseFormReturn<AlertRuleFormValues>;
    onRemove: () => void;
    canRemove: boolean;
}) {
    const t = useTranslations();
    const type = form.watch(`actions.${index}.type`);
    return (
        <div className="rounded-lg border p-4 space-y-3 relative">
            {canRemove && (
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 h-8 w-8"
                    onClick={onRemove}
                >
                    <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
            )}
            <FormField
                control={control}
                name={`actions.${index}.type`}
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>{t("alertingActionType")}</FormLabel>
                        <Select
                            value={field.value}
                            onValueChange={(v) => {
                                const nt = v as AlertRuleFormAction["type"];
                                if (nt === "notify") {
                                    form.setValue(`actions.${index}`, {
                                        type: "notify",
                                        userTags: [],
                                        roleTags: [],
                                        emailTags: []
                                    });
                                } else {
                                    form.setValue(`actions.${index}`, {
                                        type: "webhook",
                                        url: "",
                                        method: "POST",
                                        headers: [],
                                        authType: "none",
                                        bearerToken: "",
                                        basicCredentials: "",
                                        customHeaderName: "",
                                        customHeaderValue: ""
                                    });
                                }
                            }}
                        >
                            <FormControl>
                                <SelectTrigger className="max-w-xs">
                                    <SelectValue />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                <SelectItem value="notify">
                                    {t("alertingActionNotify")}
                                </SelectItem>
                                <SelectItem value="webhook">
                                    {t("alertingActionWebhook")}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </FormItem>
                )}
            />
            {type === "notify" && (
                <NotifyActionFields
                    orgId={orgId}
                    index={index}
                    control={control}
                    form={form}
                />
            )}
            {type === "webhook" && (
                <WebhookActionFields
                    index={index}
                    control={control}
                    form={form}
                />
            )}
        </div>
    );
}

function NotifyActionFields({
    orgId,
    index,
    control,
    form
}: {
    orgId: string;
    index: number;
    control: Control<AlertRuleFormValues>;
    form: UseFormReturn<AlertRuleFormValues>;
}) {
    const t = useTranslations();

    const [emailActiveIdx, setEmailActiveIdx] = useState<number | null>(null);
    const [activeUsersTagIndex, setActiveUsersTagIndex] = useState<
        number | null
    >(null);
    const [activeRolesTagIndex, setActiveRolesTagIndex] = useState<
        number | null
    >(null);

    const { data: orgUsers = [] } = useQuery(orgQueries.users({ orgId }));
    const { data: orgRoles = [] } = useQuery(orgQueries.roles({ orgId }));

    const allUsers = useMemo(
        () =>
            orgUsers.map((u) => ({
                id: String(u.id),
                text: getUserDisplayName({
                    email: u.email,
                    name: u.name,
                    username: u.username
                })
            })),
        [orgUsers]
    );

    const allRoles = useMemo(
        () =>
            orgRoles
                .map((r) => ({ id: String(r.roleId), text: r.name }))
                .filter((r) => r.text !== "Admin"),
        [orgRoles]
    );

    const userTags = (form.watch(`actions.${index}.userTags`) ?? []) as Tag[];
    const roleTags = (form.watch(`actions.${index}.roleTags`) ?? []) as Tag[];
    const emailTags = (form.watch(`actions.${index}.emailTags`) ?? []) as Tag[];

    return (
        <div className="space-y-3 pt-1">
            <FormField
                control={control}
                name={`actions.${index}.userTags`}
                render={({ field }) => (
                    <FormItem className="flex flex-col items-start">
                        <FormLabel>{t("alertingNotifyUsers")}</FormLabel>
                        <FormControl>
                            <TagInput
                                {...field}
                                activeTagIndex={activeUsersTagIndex}
                                setActiveTagIndex={setActiveUsersTagIndex}
                                placeholder={t("alertingSelectUsers")}
                                size="sm"
                                tags={userTags}
                                setTags={(newTags) => {
                                    const next =
                                        typeof newTags === "function"
                                            ? newTags(userTags)
                                            : newTags;
                                    form.setValue(
                                        `actions.${index}.userTags`,
                                        next as Tag[]
                                    );
                                }}
                                enableAutocomplete={true}
                                autocompleteOptions={allUsers}
                                allowDuplicates={false}
                                restrictTagsToAutocompleteOptions={true}
                                sortTags={true}
                            />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />
            <FormField
                control={control}
                name={`actions.${index}.roleTags`}
                render={({ field }) => (
                    <FormItem className="flex flex-col items-start">
                        <FormLabel>{t("alertingNotifyRoles")}</FormLabel>
                        <FormControl>
                            <TagInput
                                {...field}
                                activeTagIndex={activeRolesTagIndex}
                                setActiveTagIndex={setActiveRolesTagIndex}
                                placeholder={t("alertingSelectRoles")}
                                size="sm"
                                tags={roleTags}
                                setTags={(newTags) => {
                                    const next =
                                        typeof newTags === "function"
                                            ? newTags(roleTags)
                                            : newTags;
                                    form.setValue(
                                        `actions.${index}.roleTags`,
                                        next as Tag[]
                                    );
                                }}
                                enableAutocomplete={true}
                                autocompleteOptions={allRoles}
                                allowDuplicates={false}
                                restrictTagsToAutocompleteOptions={true}
                                sortTags={true}
                            />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />
            <FormField
                control={control}
                name={`actions.${index}.emailTags`}
                render={({ field }) => (
                    <FormItem className="flex flex-col items-start">
                        <FormLabel>{t("alertingNotifyEmails")}</FormLabel>
                        <FormControl>
                            <TagInput
                                {...field}
                                tags={emailTags}
                                setTags={(updater) => {
                                    const next =
                                        typeof updater === "function"
                                            ? updater(emailTags)
                                            : updater;
                                    form.setValue(
                                        `actions.${index}.emailTags`,
                                        next as Tag[]
                                    );
                                }}
                                activeTagIndex={emailActiveIdx}
                                setActiveTagIndex={setEmailActiveIdx}
                                placeholder={t("alertingEmailPlaceholder")}
                                size="sm"
                                allowDuplicates={false}
                                sortTags={true}
                                validateTag={(tag) =>
                                    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tag)
                                }
                                delimiterList={[",", "Enter"]}
                            />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />
        </div>
    );
}

function WebhookActionFields({
    index,
    control,
    form
}: {
    index: number;
    control: Control<AlertRuleFormValues>;
    form: UseFormReturn<AlertRuleFormValues>;
}) {
    const t = useTranslations();
    return (
        <div className="space-y-3 pt-1">
            <FormField
                control={control}
                name={`actions.${index}.url`}
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>URL</FormLabel>
                        <FormControl>
                            <Input
                                {...field}
                                placeholder="https://example.com/hook"
                            />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />
            <FormField
                control={control}
                name={`actions.${index}.method`}
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>{t("alertingWebhookMethod")}</FormLabel>
                        <Select
                            value={field.value}
                            onValueChange={field.onChange}
                        >
                            <FormControl>
                                <SelectTrigger className="max-w-xs">
                                    <SelectValue />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {["GET", "POST", "PUT", "PATCH"].map((m) => (
                                    <SelectItem key={m} value={m}>
                                        {m}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )}
            />
            {/* Authentication */}
            <div className="space-y-3">
                <div>
                    <label className="font-medium text-sm block">
                        {t("httpDestAuthTitle")}
                    </label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {t("httpDestAuthDescription")}
                    </p>
                </div>
                <FormField
                    control={control}
                    name={`actions.${index}.authType`}
                    render={({ field }) => (
                        <FormItem>
                            <FormControl>
                                <RadioGroup
                                    value={field.value}
                                    onValueChange={field.onChange}
                                    className="gap-2"
                                >
                                    {/* None */}
                                    <div className="flex items-start gap-3 rounded-md border p-3 transition-colors">
                                        <RadioGroupItem
                                            value="none"
                                            id={`auth-none-${index}`}
                                            className="mt-0.5"
                                        />
                                        <div>
                                            <Label
                                                htmlFor={`auth-none-${index}`}
                                                className="cursor-pointer font-medium"
                                            >
                                                {t("httpDestAuthNoneTitle")}
                                            </Label>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                {t("httpDestAuthNoneDescription")}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Bearer */}
                                    <div className="flex items-start gap-3 rounded-md border p-3">
                                        <RadioGroupItem
                                            value="bearer"
                                            id={`auth-bearer-${index}`}
                                            className="mt-0.5"
                                        />
                                        <div className="flex-1 space-y-3">
                                            <div>
                                                <Label
                                                    htmlFor={`auth-bearer-${index}`}
                                                    className="cursor-pointer font-medium"
                                                >
                                                    {t("httpDestAuthBearerTitle")}
                                                </Label>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    {t("httpDestAuthBearerDescription")}
                                                </p>
                                            </div>
                                            {field.value === "bearer" && (
                                                <FormField
                                                    control={control}
                                                    name={`actions.${index}.bearerToken`}
                                                    render={({ field: f }) => (
                                                        <FormItem>
                                                            <FormControl>
                                                                <Input
                                                                    {...f}
                                                                    placeholder={t("httpDestAuthBearerPlaceholder")}
                                                                />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            )}
                                        </div>
                                    </div>

                                    {/* Basic */}
                                    <div className="flex items-start gap-3 rounded-md border p-3">
                                        <RadioGroupItem
                                            value="basic"
                                            id={`auth-basic-${index}`}
                                            className="mt-0.5"
                                        />
                                        <div className="flex-1 space-y-3">
                                            <div>
                                                <Label
                                                    htmlFor={`auth-basic-${index}`}
                                                    className="cursor-pointer font-medium"
                                                >
                                                    {t("httpDestAuthBasicTitle")}
                                                </Label>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    {t("httpDestAuthBasicDescription")}
                                                </p>
                                            </div>
                                            {field.value === "basic" && (
                                                <FormField
                                                    control={control}
                                                    name={`actions.${index}.basicCredentials`}
                                                    render={({ field: f }) => (
                                                        <FormItem>
                                                            <FormControl>
                                                                <Input
                                                                    {...f}
                                                                    placeholder={t("httpDestAuthBasicPlaceholder")}
                                                                />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            )}
                                        </div>
                                    </div>

                                    {/* Custom */}
                                    <div className="flex items-start gap-3 rounded-md border p-3">
                                        <RadioGroupItem
                                            value="custom"
                                            id={`auth-custom-${index}`}
                                            className="mt-0.5"
                                        />
                                        <div className="flex-1 space-y-3">
                                            <div>
                                                <Label
                                                    htmlFor={`auth-custom-${index}`}
                                                    className="cursor-pointer font-medium"
                                                >
                                                    {t("httpDestAuthCustomTitle")}
                                                </Label>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    {t("httpDestAuthCustomDescription")}
                                                </p>
                                            </div>
                                            {field.value === "custom" && (
                                                <div className="flex gap-2">
                                                    <FormField
                                                        control={control}
                                                        name={`actions.${index}.customHeaderName`}
                                                        render={({ field: f }) => (
                                                            <FormItem className="flex-1">
                                                                <FormControl>
                                                                    <Input
                                                                        {...f}
                                                                        placeholder={t("httpDestAuthCustomHeaderNamePlaceholder")}
                                                                    />
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                    <FormField
                                                        control={control}
                                                        name={`actions.${index}.customHeaderValue`}
                                                        render={({ field: f }) => (
                                                            <FormItem className="flex-1">
                                                                <FormControl>
                                                                    <Input
                                                                        {...f}
                                                                        placeholder={t("httpDestAuthCustomHeaderValuePlaceholder")}
                                                                    />
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </RadioGroup>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>
            <WebhookHeadersField index={index} control={control} form={form} />
        </div>
    );
}

function WebhookHeadersField({
    index,
    control,
    form
}: {
    index: number;
    control: Control<AlertRuleFormValues>;
    form: UseFormReturn<AlertRuleFormValues>;
}) {
    const t = useTranslations();
    const headers =
        form.watch(`actions.${index}.headers` as const) ?? [];
    return (
        <div className="space-y-2">
            <FormLabel>{t("alertingWebhookHeaders")}</FormLabel>
            {headers.map((_, hi) => (
                <div key={hi} className="flex gap-2 items-start">
                    <FormField
                        control={control}
                        name={`actions.${index}.headers.${hi}.key`}
                        render={({ field }) => (
                            <FormItem className="flex-1">
                                <FormControl>
                                    <Input {...field} placeholder="Key" />
                                </FormControl>
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={control}
                        name={`actions.${index}.headers.${hi}.value`}
                        render={({ field }) => (
                            <FormItem className="flex-1">
                                <FormControl>
                                    <Input {...field} placeholder="Value" />
                                </FormControl>
                            </FormItem>
                        )}
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={() => {
                            const cur =
                                form.getValues(
                                    `actions.${index}.headers`
                                ) ?? [];
                            form.setValue(
                                `actions.${index}.headers`,
                                cur.filter((__, i) => i !== hi)
                            );
                        }}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            ))}
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                    const cur =
                        form.getValues(`actions.${index}.headers`) ?? [];
                    form.setValue(`actions.${index}.headers`, [
                        ...cur,
                        { key: "", value: "" }
                    ]);
                }}
            >
                <Plus className="h-4 w-4 mr-1" />
                {t("alertingAddHeader")}
            </Button>
        </div>
    );
}

export function AlertRuleSourceFields({
    orgId,
    control
}: {
    orgId: string;
    control: Control<AlertRuleFormValues>;
}) {
    const t = useTranslations();
    const { setValue, getValues } = useFormContext<AlertRuleFormValues>();
    const sourceType = useWatch({ control, name: "sourceType" });
    return (
        <div className="space-y-4">
            <FormField
                control={control}
                name="sourceType"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>{t("alertingSourceType")}</FormLabel>
                        <Select
                            value={field.value}
                            onValueChange={(v) => {
                                const next =
                                    v as AlertRuleFormValues["sourceType"];
                                field.onChange(next);
                                const curTrigger = getValues("trigger");
                                if (next === "site") {
                                    if (
                                        curTrigger !== "site_online" &&
                                        curTrigger !== "site_offline"
                                    ) {
                                        setValue("trigger", "site_offline", {
                                            shouldValidate: true
                                        });
                                    }
                                } else if (
                                    curTrigger !== "health_check_healthy" &&
                                    curTrigger !== "health_check_unhealthy"
                                ) {
                                    setValue(
                                        "trigger",
                                        "health_check_unhealthy",
                                        { shouldValidate: true }
                                    );
                                }
                            }}
                        >
                            <FormControl>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                <SelectItem value="site">
                                    {t("alertingSourceSite")}
                                </SelectItem>
                                <SelectItem value="health_check">
                                    {t("alertingSourceHealthCheck")}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )}
            />
            {sourceType === "site" ? (
                <FormField
                    control={control}
                    name="siteIds"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t("alertingPickSites")}</FormLabel>
                            <SiteMultiSelect
                                orgId={orgId}
                                value={field.value}
                                onChange={field.onChange}
                            />
                            <FormMessage />
                        </FormItem>
                    )}
                />
            ) : (
                <FormField
                    control={control}
                    name="healthCheckIds"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>
                                {t("alertingPickHealthChecks")}
                            </FormLabel>
                            <HealthCheckMultiSelect
                                orgId={orgId}
                                value={field.value}
                                onChange={field.onChange}
                            />
                            <FormMessage />
                        </FormItem>
                    )}
                />
            )}
        </div>
    );
}

export function AlertRuleTriggerFields({
    control
}: {
    control: Control<AlertRuleFormValues>;
}) {
    const t = useTranslations();
    const sourceType = useWatch({ control, name: "sourceType" });
    return (
        <FormField
            control={control}
            name="trigger"
            render={({ field }) => (
                <FormItem>
                    <FormLabel>{t("alertingTrigger")}</FormLabel>
                    <Select
                        key={sourceType}
                        value={field.value}
                        onValueChange={field.onChange}
                    >
                        <FormControl>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            {sourceType === "site" ? (
                                <>
                                    <SelectItem value="site_online">
                                        {t("alertingTriggerSiteOnline")}
                                    </SelectItem>
                                    <SelectItem value="site_offline">
                                        {t("alertingTriggerSiteOffline")}
                                    </SelectItem>
                                </>
                            ) : (
                                <>
                                    <SelectItem value="health_check_healthy">
                                        {t("alertingTriggerHcHealthy")}
                                    </SelectItem>
                                    <SelectItem value="health_check_unhealthy">
                                        {t("alertingTriggerHcUnhealthy")}
                                    </SelectItem>
                                </>
                            )}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                </FormItem>
            )}
        />
    );
}