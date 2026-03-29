"use client";

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
    Form,
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
import { Separator } from "@app/components/ui/separator";
import { Switch } from "@app/components/ui/switch";
import { TagInput, type Tag } from "@app/components/tags/tag-input";
import { toast } from "@app/hooks/useToast";
import { getUserDisplayName } from "@app/lib/getUserDisplayName";
import {
    type AlertRule,
    type AlertTrigger,
    isoNow,
    newRuleId,
    upsertRule
} from "@app/lib/alertRulesLocalStorage";
import { orgQueries } from "@app/lib/queries";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import type { Control, UseFormReturn } from "react-hook-form";
import { useFieldArray, useForm } from "react-hook-form";
import { useDebounce } from "use-debounce";
import { z } from "zod";

const FORM_ID = "alert-rule-form";

const tagSchema = z.object({
    id: z.string(),
    text: z.string()
});

type FormAction =
    | {
          type: "notify";
          userIds: string[];
          roleIds: number[];
          emailTags: Tag[];
      }
    | { type: "sms"; phoneTags: Tag[] }
    | {
          type: "webhook";
          url: string;
          method: string;
          headers: { key: string; value: string }[];
          secret: string;
      };

export type AlertRuleFormValues = {
    name: string;
    enabled: boolean;
    sourceType: "site" | "health_check";
    siteIds: number[];
    targetIds: number[];
    trigger: AlertTrigger;
    actions: FormAction[];
};

function buildFormSchema(t: (k: string) => string) {
    return z
        .object({
            name: z.string().min(1, { message: t("alertingErrorNameRequired") }),
            enabled: z.boolean(),
            sourceType: z.enum(["site", "health_check"]),
            siteIds: z.array(z.number()),
            targetIds: z.array(z.number()),
            trigger: z.enum([
                "site_online",
                "site_offline",
                "health_check_healthy",
                "health_check_unhealthy"
            ]),
            actions: z
                .array(
                    z.discriminatedUnion("type", [
                        z.object({
                            type: z.literal("notify"),
                            userIds: z.array(z.string()),
                            roleIds: z.array(z.number()),
                            emailTags: z.array(tagSchema)
                        }),
                        z.object({
                            type: z.literal("sms"),
                            phoneTags: z.array(tagSchema)
                        }),
                        z.object({
                            type: z.literal("webhook"),
                            url: z.string(),
                            method: z.string(),
                            headers: z.array(
                                z.object({
                                    key: z.string(),
                                    value: z.string()
                                })
                            ),
                            secret: z.string()
                        })
                    ])
                )
                .min(1, { message: t("alertingErrorActionsMin") })
        })
        .superRefine((val, ctx) => {
            if (val.sourceType === "site" && val.siteIds.length === 0) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: t("alertingErrorPickSites"),
                    path: ["siteIds"]
                });
            }
            if (
                val.sourceType === "health_check" &&
                val.targetIds.length === 0
            ) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: t("alertingErrorPickHealthChecks"),
                    path: ["targetIds"]
                });
            }
            const siteTriggers: AlertTrigger[] = [
                "site_online",
                "site_offline"
            ];
            const hcTriggers: AlertTrigger[] = [
                "health_check_healthy",
                "health_check_unhealthy"
            ];
            if (
                val.sourceType === "site" &&
                !siteTriggers.includes(val.trigger)
            ) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: t("alertingErrorTriggerSite"),
                    path: ["trigger"]
                });
            }
            if (
                val.sourceType === "health_check" &&
                !hcTriggers.includes(val.trigger)
            ) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: t("alertingErrorTriggerHealth"),
                    path: ["trigger"]
                });
            }
            val.actions.forEach((a, i) => {
                if (a.type === "notify") {
                    if (
                        a.userIds.length === 0 &&
                        a.roleIds.length === 0 &&
                        a.emailTags.length === 0
                    ) {
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            message: t("alertingErrorNotifyRecipients"),
                            path: ["actions", i, "userIds"]
                        });
                    }
                }
                if (a.type === "sms" && a.phoneTags.length === 0) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: t("alertingErrorSmsPhones"),
                        path: ["actions", i, "phoneTags"]
                    });
                }
                if (a.type === "webhook") {
                    try {
                        // eslint-disable-next-line no-new
                        new URL(a.url.trim());
                    } catch {
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            message: t("alertingErrorWebhookUrl"),
                            path: ["actions", i, "url"]
                        });
                    }
                }
            });
        });
}

function defaultFormValues(): AlertRuleFormValues {
    return {
        name: "",
        enabled: true,
        sourceType: "site",
        siteIds: [],
        targetIds: [],
        trigger: "site_offline",
        actions: [
            {
                type: "notify",
                userIds: [],
                roleIds: [],
                emailTags: []
            }
        ]
    };
}

function ruleToFormValues(rule: AlertRule): AlertRuleFormValues {
    const actions: FormAction[] = rule.actions.map((a) => {
        if (a.type === "notify") {
            return {
                type: "notify",
                userIds: a.userIds.map(String),
                roleIds: [...a.roleIds],
                emailTags: a.emails.map((e) => ({ id: e, text: e }))
            };
        }
        if (a.type === "sms") {
            return {
                type: "sms",
                phoneTags: a.phoneNumbers.map((p) => ({ id: p, text: p }))
            };
        }
        return {
            type: "webhook",
            url: a.url,
            method: a.method,
            headers:
                a.headers.length > 0
                    ? a.headers.map((h) => ({ ...h }))
                    : [{ key: "", value: "" }],
            secret: a.secret ?? ""
        };
    });
    return {
        name: rule.name,
        enabled: rule.enabled,
        sourceType: rule.source.type,
        siteIds:
            rule.source.type === "site" ? [...rule.source.siteIds] : [],
        targetIds:
            rule.source.type === "health_check"
                ? [...rule.source.targetIds]
                : [],
        trigger: rule.trigger,
        actions
    };
}

function formValuesToRule(
    v: AlertRuleFormValues,
    id: string,
    createdAt: string
): AlertRule {
    const source =
        v.sourceType === "site"
            ? { type: "site" as const, siteIds: v.siteIds }
            : {
                  type: "health_check" as const,
                  targetIds: v.targetIds
              };
    const actions = v.actions.map((a) => {
        if (a.type === "notify") {
            return {
                type: "notify" as const,
                userIds: a.userIds,
                roleIds: a.roleIds,
                emails: a.emailTags.map((t) => t.text.trim()).filter(Boolean)
            };
        }
        if (a.type === "sms") {
            return {
                type: "sms" as const,
                phoneNumbers: a.phoneTags
                    .map((t) => t.text.trim())
                    .filter(Boolean)
            };
        }
        return {
            type: "webhook" as const,
            url: a.url.trim(),
            method: a.method,
            headers: a.headers.filter((h) => h.key.trim() || h.value.trim()),
            secret: a.secret.trim() || undefined
        };
    });
    return {
        id,
        name: v.name.trim(),
        enabled: v.enabled,
        createdAt,
        updatedAt: isoNow(),
        source,
        trigger: v.trigger,
        actions
    };
}

type TargetRow = {
    targetId: number;
    resourceName: string;
    ip: string;
    port: number;
};

function useHealthCheckOptions(orgId: string) {
    const { data: resources = [] } = useQuery(
        orgQueries.resources({ orgId, perPage: 10_000 })
    );
    return useMemo(() => {
        const rows: TargetRow[] = [];
        for (const r of resources) {
            for (const t of r.targets) {
                const ext = t as typeof t & { hcEnabled?: boolean };
                if (ext.hcEnabled === true) {
                    rows.push({
                        targetId: t.targetId,
                        resourceName: r.name,
                        ip: t.ip,
                        port: t.port
                    });
                }
            }
        }
        return rows;
    }, [resources]);
}

type AlertRuleCredenzaProps = {
    open: boolean;
    setOpen: (open: boolean) => void;
    orgId: string;
    rule: AlertRule | null;
    onSaved: () => void;
};

export default function AlertRuleCredenza({
    open,
    setOpen,
    orgId,
    rule,
    onSaved
}: AlertRuleCredenzaProps) {
    const t = useTranslations();
    const schema = useMemo(() => buildFormSchema(t), [t]);
    const form = useForm<AlertRuleFormValues>({
        resolver: zodResolver(schema),
        defaultValues: defaultFormValues()
    });
    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "actions"
    });

    const sourceType = form.watch("sourceType");
    const trigger = form.watch("trigger");

    const ruleKey = rule?.id ?? "__new__";
    useEffect(() => {
        if (!open) return;
        if (rule) {
            form.reset(ruleToFormValues(rule));
        } else {
            form.reset(defaultFormValues());
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when opening or switching create/edit target
    }, [open, ruleKey]);

    useEffect(() => {
        if (sourceType === "site") {
            if (
                trigger !== "site_online" &&
                trigger !== "site_offline"
            ) {
                form.setValue("trigger", "site_offline");
            }
        } else if (
            trigger !== "health_check_healthy" &&
            trigger !== "health_check_unhealthy"
        ) {
            form.setValue("trigger", "health_check_unhealthy");
        }
    }, [sourceType, trigger, form]);

    const onSubmit = form.handleSubmit((values) => {
        const id = rule?.id ?? newRuleId();
        const createdAt = rule?.createdAt ?? isoNow();
        const next = formValuesToRule(values, id, createdAt);
        upsertRule(orgId, next);
        toast({ title: t("alertingRuleSaved") });
        onSaved();
        setOpen(false);
    });

    return (
        <Credenza open={open} onOpenChange={setOpen}>
            <CredenzaContent className="max-h-[90vh] flex flex-col">
                <CredenzaHeader>
                    <CredenzaTitle>
                        {rule
                            ? t("alertingEditRule")
                            : t("alertingCreateRule")}
                    </CredenzaTitle>
                    <CredenzaDescription>
                        {t("alertingRuleCredenzaDescription")}
                    </CredenzaDescription>
                </CredenzaHeader>
                <CredenzaBody className="overflow-y-auto">
                    <Form {...form}>
                        <form
                            id={FORM_ID}
                            onSubmit={onSubmit}
                            className="space-y-6"
                        >
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
                                                    "alertingRuleNamePlaceholder"
                                                )}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="enabled"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                                        <FormLabel className="cursor-pointer">
                                            {t("alertingRuleEnabled")}
                                        </FormLabel>
                                        <FormControl>
                                            <Switch
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                            />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />

                            <div>
                                <h4 className="text-sm font-medium mb-2">
                                    {t("alertingSectionSource")}
                                </h4>
                                <FormField
                                    control={form.control}
                                    name="sourceType"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                {t("alertingSourceType")}
                                            </FormLabel>
                                            <Select
                                                value={field.value}
                                                onValueChange={(v) =>
                                                    field.onChange(v)
                                                }
                                            >
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="site">
                                                        {t(
                                                            "alertingSourceSite"
                                                        )}
                                                    </SelectItem>
                                                    <SelectItem value="health_check">
                                                        {t(
                                                            "alertingSourceHealthCheck"
                                                        )}
                                                    </SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                {sourceType === "site" ? (
                                    <FormField
                                        control={form.control}
                                        name="siteIds"
                                        render={({ field }) => (
                                            <FormItem className="mt-3">
                                                <FormLabel>
                                                    {t("alertingPickSites")}
                                                </FormLabel>
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
                                        control={form.control}
                                        name="targetIds"
                                        render={({ field }) => (
                                            <FormItem className="mt-3">
                                                <FormLabel>
                                                    {t(
                                                        "alertingPickHealthChecks"
                                                    )}
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

                            <Separator />

                            <div>
                                <h4 className="text-sm font-medium mb-2">
                                    {t("alertingSectionTrigger")}
                                </h4>
                                <FormField
                                    control={form.control}
                                    name="trigger"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                {t("alertingTrigger")}
                                            </FormLabel>
                                            <Select
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
                                                                {t(
                                                                    "alertingTriggerSiteOnline"
                                                                )}
                                                            </SelectItem>
                                                            <SelectItem value="site_offline">
                                                                {t(
                                                                    "alertingTriggerSiteOffline"
                                                                )}
                                                            </SelectItem>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <SelectItem value="health_check_healthy">
                                                                {t(
                                                                    "alertingTriggerHcHealthy"
                                                                )}
                                                            </SelectItem>
                                                            <SelectItem value="health_check_unhealthy">
                                                                {t(
                                                                    "alertingTriggerHcUnhealthy"
                                                                )}
                                                            </SelectItem>
                                                        </>
                                                    )}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <Separator />

                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-medium">
                                        {t("alertingSectionActions")}
                                    </h4>
                                    <DropdownAddAction
                                        onPick={(type) => {
                                            if (type === "notify") {
                                                append({
                                                    type: "notify",
                                                    userIds: [],
                                                    roleIds: [],
                                                    emailTags: []
                                                });
                                            } else if (type === "sms") {
                                                append({
                                                    type: "sms",
                                                    phoneTags: []
                                                });
                                            } else {
                                                append({
                                                    type: "webhook",
                                                    url: "",
                                                    method: "POST",
                                                    headers: [
                                                        { key: "", value: "" }
                                                    ],
                                                    secret: ""
                                                });
                                            }
                                        }}
                                    />
                                </div>
                                {fields.map((f, index) => (
                                    <ActionBlock
                                        key={f.id}
                                        orgId={orgId}
                                        index={index}
                                        control={form.control}
                                        form={form}
                                        onRemove={() => remove(index)}
                                        canRemove={fields.length > 1}
                                    />
                                ))}
                            </div>
                        </form>
                    </Form>
                </CredenzaBody>
                <CredenzaFooter>
                    <CredenzaClose asChild>
                        <Button variant="outline" type="button">
                            {t("close")}
                        </Button>
                    </CredenzaClose>
                    <Button type="submit" form={FORM_ID}>
                        {t("save")}
                    </Button>
                </CredenzaFooter>
            </CredenzaContent>
        </Credenza>
    );
}

function DropdownAddAction({
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
    const rows = useHealthCheckOptions(orgId);
    const filtered = useMemo(() => {
        const qq = q.trim().toLowerCase();
        if (!qq) return rows;
        return rows.filter(
            (r) =>
                r.resourceName.toLowerCase().includes(qq) ||
                `${r.ip}:${r.port}`.includes(qq)
        );
    }, [rows, q]);
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
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                >
                    <span className="truncate">{summary}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] max-h-72 p-0">
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder={t("search")}
                        value={q}
                        onValueChange={setQ}
                    />
                    <CommandList>
                        <CommandEmpty>
                            {t("alertingNoHealthChecks")}
                        </CommandEmpty>
                        <CommandGroup>
                            {filtered.map((r) => (
                                <CommandItem
                                    key={r.targetId}
                                    value={`${r.targetId}`}
                                    onSelect={() => toggle(r.targetId)}
                                    className="cursor-pointer"
                                >
                                    <Checkbox
                                        checked={value.includes(r.targetId)}
                                        className="mr-2 pointer-events-none"
                                    />
                                    <span className="truncate">
                                        {r.resourceName} · {r.ip}:{r.port}
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

function ActionBlock({
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
                                const nt = v as FormAction["type"];
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
                <NotifyActionFields orgId={orgId} index={index} control={control} form={form} />
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
                                placeholder={t(
                                    "alertingEmailPlaceholder"
                                )}
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
                        placeholder={t("search")}
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
                <Command>
                    <CommandList>
                        <CommandGroup>
                            {roles.map((r) => (
                                <CommandItem
                                    key={r.roleId}
                                    value={`${r.roleId}`}
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
