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
import { TagInput } from "@app/components/tags/tag-input";
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
    onPick
}: {
    onPick: (type: "notify" | "sms" | "webhook") => void;
}) {
    const t = useTranslations();
    const [open, setOpen] = useState(false);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    {t("alertingAddAction")}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-2" align="end">
                <div className="flex flex-col gap-1">
                    <Button
                        type="button"
                        variant="ghost"
                        className="justify-start"
                        onClick={() => {
                            onPick("notify");
                            setOpen(false);
                        }}
                    >
                        {t("alertingActionNotify")}
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        className="justify-start"
                        onClick={() => {
                            onPick("sms");
                            setOpen(false);
                        }}
                    >
                        {t("alertingActionSms")}
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        className="justify-start"
                        onClick={() => {
                            onPick("webhook");
                            setOpen(false);
                        }}
                    >
                        {t("alertingActionWebhook")}
                    </Button>
                </div>
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

const ALERT_RESOURCES_PAGE_SIZE = 10;

function ResourceTenMultiSelect({
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
    const { data: resources = [] } = useQuery(
        orgQueries.resources({
            orgId,
            perPage: ALERT_RESOURCES_PAGE_SIZE
        })
    );
    const rows = useMemo(() => {
        const out: {
            resourceId: number;
            name: string;
            targetIds: number[];
        }[] = [];
        for (const r of resources) {
            const targetIds = r.targets.map((x) => x.targetId);
            if (targetIds.length > 0) {
                out.push({
                    resourceId: r.resourceId,
                    name: r.name,
                    targetIds
                });
            }
        }
        return out;
    }, [resources]);

    const selectedResourceCount = useMemo(
        () =>
            rows.filter(
                (row) =>
                    row.targetIds.length > 0 &&
                    row.targetIds.every((id) => value.includes(id))
            ).length,
        [rows, value]
    );

    const toggle = (targetIds: number[]) => {
        const allOn =
            targetIds.length > 0 &&
            targetIds.every((id) => value.includes(id));
        if (allOn) {
            onChange(value.filter((id) => !targetIds.includes(id)));
        } else {
            onChange([...new Set([...value, ...targetIds])]);
        }
    };

    const summary =
        selectedResourceCount === 0
            ? t("alertingSelectResources")
            : t("alertingResourcesSelected", {
                  count: selectedResourceCount
              });

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
                <div className="max-h-72 overflow-y-auto p-2 space-y-0.5">
                    {rows.length === 0 ? (
                        <p className="text-sm text-muted-foreground px-2 py-1.5">
                            {t("alertingResourcesEmpty")}
                        </p>
                    ) : (
                        rows.map((row) => {
                            const checked =
                                row.targetIds.length > 0 &&
                                row.targetIds.every((id) =>
                                    value.includes(id)
                                );
                            return (
                                <button
                                    key={row.resourceId}
                                    type="button"
                                    onClick={() => toggle(row.targetIds)}
                                    className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                                >
                                    <Checkbox
                                        checked={checked}
                                        className="pointer-events-none shrink-0"
                                        aria-hidden
                                    />
                                    <span className="truncate">
                                        {row.name}
                                    </span>
                                </button>
                            );
                        })
                    )}
                </div>
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
                                        userIds: [],
                                        roleIds: [],
                                        emailTags: []
                                    });
                                } else if (nt === "sms") {
                                    form.setValue(`actions.${index}`, {
                                        type: "sms",
                                        phoneTags: []
                                    });
                                } else {
                                    form.setValue(`actions.${index}`, {
                                        type: "webhook",
                                        url: "",
                                        method: "POST",
                                        headers: [{ key: "", value: "" }],
                                        secret: ""
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
                                <SelectItem value="sms">
                                    {t("alertingActionSms")}
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
            {type === "sms" && (
                <SmsActionFields index={index} control={control} form={form} />
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
    const userIds = form.watch(`actions.${index}.userIds`) ?? [];
    const roleIds = form.watch(`actions.${index}.roleIds`) ?? [];
    const emailTags = form.watch(`actions.${index}.emailTags`) ?? [];

    return (
        <div className="space-y-3 pt-1">
            <FormItem>
                <FormLabel>{t("alertingNotifyUsers")}</FormLabel>
                <UserMultiSelect
                    orgId={orgId}
                    value={userIds}
                    onChange={(ids) =>
                        form.setValue(`actions.${index}.userIds`, ids)
                    }
                />
            </FormItem>
            <FormItem>
                <FormLabel>{t("alertingNotifyRoles")}</FormLabel>
                <RoleMultiSelect
                    orgId={orgId}
                    value={roleIds}
                    onChange={(ids) =>
                        form.setValue(`actions.${index}.roleIds`, ids)
                    }
                />
            </FormItem>
            <FormField
                control={control}
                name={`actions.${index}.emailTags`}
                render={() => (
                    <FormItem>
                        <FormLabel>{t("alertingNotifyEmails")}</FormLabel>
                        <FormControl>
                            <TagInput
                                tags={emailTags}
                                setTags={(updater) => {
                                    const next =
                                        typeof updater === "function"
                                            ? updater(emailTags)
                                            : updater;
                                    form.setValue(
                                        `actions.${index}.emailTags`,
                                        next
                                    );
                                }}
                                activeTagIndex={emailActiveIdx}
                                setActiveTagIndex={setEmailActiveIdx}
                                placeholder={t("alertingEmailPlaceholder")}
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

function SmsActionFields({
    index,
    control,
    form
}: {
    index: number;
    control: Control<AlertRuleFormValues>;
    form: UseFormReturn<AlertRuleFormValues>;
}) {
    const t = useTranslations();
    const [phoneActiveIdx, setPhoneActiveIdx] = useState<number | null>(null);
    const phoneTags = form.watch(`actions.${index}.phoneTags`) ?? [];
    return (
        <FormField
            control={control}
            name={`actions.${index}.phoneTags`}
            render={() => (
                <FormItem>
                    <FormLabel>{t("alertingSmsNumbers")}</FormLabel>
                    <FormControl>
                        <TagInput
                            tags={phoneTags}
                            setTags={(updater) => {
                                const next =
                                    typeof updater === "function"
                                        ? updater(phoneTags)
                                        : updater;
                                form.setValue(
                                    `actions.${index}.phoneTags`,
                                    next
                                );
                            }}
                            activeTagIndex={phoneActiveIdx}
                            setActiveTagIndex={setPhoneActiveIdx}
                            placeholder={t("alertingSmsPlaceholder")}
                            delimiterList={[",", "Enter"]}
                        />
                    </FormControl>
                    <FormMessage />
                </FormItem>
            )}
        />
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
            <FormField
                control={control}
                name={`actions.${index}.secret`}
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>{t("alertingWebhookSecret")}</FormLabel>
                        <FormControl>
                            <Input
                                {...field}
                                type="password"
                                autoComplete="new-password"
                                placeholder={t(
                                    "alertingWebhookSecretPlaceholder"
                                )}
                            />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />
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

function UserMultiSelect({
    orgId,
    value,
    onChange
}: {
    orgId: string;
    value: string[];
    onChange: (v: string[]) => void;
}) {
    const t = useTranslations();
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");
    const [debounced] = useDebounce(q, 150);
    const { data: users = [] } = useQuery(orgQueries.users({ orgId }));
    const shown = useMemo(() => {
        const qq = debounced.trim().toLowerCase();
        if (!qq) return users.slice(0, 200);
        return users
            .filter((u) => {
                const label = getUserDisplayName({
                    email: u.email,
                    name: u.name,
                    username: u.username
                }).toLowerCase();
                return (
                    label.includes(qq) ||
                    (u.email ?? "").toLowerCase().includes(qq)
                );
            })
            .slice(0, 200);
    }, [users, debounced]);
    const toggle = (id: string) => {
        if (value.includes(id)) {
            onChange(value.filter((x) => x !== id));
        } else {
            onChange([...value, id]);
        }
    };
    const summary =
        value.length === 0
            ? t("alertingSelectUsers")
            : t("alertingUsersSelected", { count: value.length });
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
                        placeholder={t("searchPlaceholder")}
                        value={q}
                        onValueChange={setQ}
                    />
                    <CommandList>
                        <CommandEmpty>{t("noResults")}</CommandEmpty>
                        <CommandGroup>
                            {shown.map((u) => {
                                const uid = String(u.id);
                                return (
                                    <CommandItem
                                        key={uid}
                                        value={uid}
                                        onSelect={() => toggle(uid)}
                                        className="cursor-pointer"
                                    >
                                        <Checkbox
                                            checked={value.includes(uid)}
                                            className="mr-2 pointer-events-none"
                                        />
                                        {getUserDisplayName({
                                            email: u.email,
                                            name: u.name,
                                            username: u.username
                                        })}
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

function RoleMultiSelect({
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
    const { data: roles = [] } = useQuery(orgQueries.roles({ orgId }));
    const toggle = (id: number) => {
        if (value.includes(id)) {
            onChange(value.filter((x) => x !== id));
        } else {
            onChange([...value, id]);
        }
    };
    const summary =
        value.length === 0
            ? t("alertingSelectRoles")
            : t("alertingRolesSelected", { count: value.length });
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
                    <CommandList>
                        <CommandGroup>
                            {roles.map((r) => (
                                <CommandItem
                                    key={r.roleId}
                                    value={`role-${r.roleId}`}
                                    onSelect={() => toggle(r.roleId)}
                                    className="cursor-pointer"
                                >
                                    <Checkbox
                                        checked={value.includes(r.roleId)}
                                        className="mr-2 pointer-events-none"
                                    />
                                    {r.name}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
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
                                const next = v as AlertRuleFormValues["sourceType"];
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
                    name="targetIds"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t("alertingPickResources")}</FormLabel>
                            <ResourceTenMultiSelect
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
