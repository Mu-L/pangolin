"use client";

import {
    ActionBlock,
    AlertRuleSourceFields,
    AlertRuleTriggerFields,
    DropdownAddAction
} from "@app/components/alert-rule-editor/AlertRuleFields";
import { SettingsContainer } from "@app/components/Settings";
import { Button } from "@app/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@app/components/ui/card";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@app/components/ui/form";
import { Input } from "@app/components/ui/input";
import { Switch } from "@app/components/ui/switch";
import { toast } from "@app/hooks/useToast";
import {
    buildFormSchema,
    defaultFormValues,
    formValuesToApiPayload,
    type AlertRuleFormAction,
    type AlertRuleFormValues
} from "@app/lib/alertRuleForm";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import type { CreateAlertRuleResponse } from "@server/private/routers/alertRule";
import type { AxiosResponse } from "axios";
import { cn } from "@app/lib/cn";
import {
    Background,
    Handle,
    Position,
    ReactFlow,
    ReactFlowProvider,
    useEdgesState,
    useNodesState,
    type Edge,
    type Node,
    type NodeProps,
    type NodeTypes
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { useTranslations } from "next-intl";
import { PaidFeaturesAlert } from "@app/components/PaidFeaturesAlert";
import { tierMatrix } from "@server/lib/billing/tierMatrix";

type AlertRuleT = ReturnType<typeof useTranslations>;

export type AlertStepId = "source" | "trigger" | "actions";

type AlertStepNodeData = {
    roleLabel: string;
    title: string;
    subtitle: string;
    configured: boolean;
    accent: string;
    topBorderClass: string;
};

function summarizeSource(v: AlertRuleFormValues, t: AlertRuleT) {
    if (v.sourceType === "site") {
        if (v.siteIds.length === 0) {
            return t("alertingNodeNotConfigured");
        }
        return t("alertingSummarySites", { count: v.siteIds.length });
    }
    if (v.healthCheckIds.length === 0) {
        return t("alertingNodeNotConfigured");
    }
    return t("alertingSummaryHealthChecks", { count: v.healthCheckIds.length });
}

function summarizeTrigger(v: AlertRuleFormValues, t: AlertRuleT) {
    switch (v.trigger) {
        case "site_online":
            return t("alertingTriggerSiteOnline");
        case "site_offline":
            return t("alertingTriggerSiteOffline");
        case "site_toggle":
            return t("alertingTriggerSiteToggle");
        case "health_check_healthy":
            return t("alertingTriggerHcHealthy");
        case "health_check_unhealthy":
            return t("alertingTriggerHcUnhealthy");
        case "health_check_toggle":
            return t("alertingTriggerHcToggle");
        default:
            return v.trigger;
    }
}

function oneActionConfigured(a: AlertRuleFormAction): boolean {
    if (a.type === "notify") {
        return (
            a.userTags.length > 0 ||
            a.roleTags.length > 0 ||
            a.emailTags.length > 0
        );
    }

    try {
        new URL(a.url.trim());
        return true;
    } catch {
        return false;
    }
}

function actionTypeLabel(a: AlertRuleFormAction, t: AlertRuleT): string {
    switch (a.type) {
        case "notify":
            return t("alertingActionNotify");
        case "webhook":
            return t("alertingActionWebhook");
    }
}

function summarizeOneAction(a: AlertRuleFormAction, t: AlertRuleT): string {
    if (a.type === "notify") {
        if (
            a.userTags.length === 0 &&
            a.roleTags.length === 0 &&
            a.emailTags.length === 0
        ) {
            return t("alertingNodeNotConfigured");
        }
        const parts: string[] = [];
        if (a.userTags.length > 0) {
            parts.push(t("alertingUsersSelected", { count: a.userTags.length }));
        }
        if (a.roleTags.length > 0) {
            parts.push(t("alertingRolesSelected", { count: a.roleTags.length }));
        }
        if (a.emailTags.length > 0) {
            parts.push(
                `${t("alertingNotifyEmails")} (${a.emailTags.length})`
            );
        }
        return parts.join(" · ");
    }
    const url = a.url.trim();
    if (!url) {
        return t("alertingNodeNotConfigured");
    }
    try {
        return new URL(url).hostname;
    } catch {
        return t("alertingNodeNotConfigured");
    }
}

function stepConfigured(
    step: "source" | "trigger",
    v: AlertRuleFormValues
): boolean {
    if (step === "source") {
        return v.sourceType === "site"
            ? v.siteIds.length > 0
            : v.healthCheckIds.length > 0;
    }
    return Boolean(v.trigger);
}

function buildActionStepNodeData(
    index: number,
    action: AlertRuleFormAction,
    t: AlertRuleT
): AlertStepNodeData {
    return {
        roleLabel: `${t("alertingNodeRoleAction")} ${index + 1}`,
        title: actionTypeLabel(action, t),
        subtitle: summarizeOneAction(action, t),
        configured: oneActionConfigured(action),
        accent: "text-amber-600 dark:text-amber-400",
        topBorderClass: "border-t-amber-500"
    };
}

function buildActionsPlaceholderNodeData(t: AlertRuleT): AlertStepNodeData {
    return {
        roleLabel: t("alertingNodeRoleAction"),
        title: t("alertingSectionActions"),
        subtitle: t("alertingNodeNotConfigured"),
        configured: false,
        accent: "text-amber-600 dark:text-amber-400",
        topBorderClass: "border-t-amber-500"
    };
}

const AlertStepNode = memo(function AlertStepNodeFn({
    data,
    selected
}: NodeProps<Node<AlertStepNodeData>>) {
    return (
        <div
            className={cn(
                "relative rounded-xl border-2 border-t-[3px] bg-card px-5 py-4 shadow-sm min-w-[260px] max-w-[320px] transition-shadow",
                data.topBorderClass,
                selected
                    ? "border-primary ring-2 ring-primary/25 shadow-md"
                    : "border-border"
            )}
        >
            <Handle
                type="target"
                position={Position.Top}
                className="!bg-muted-foreground !w-2 !h-2"
            />
            {data.configured && (
                <Check
                    className="absolute top-3 right-3 h-5 w-5 text-green-600"
                    aria-hidden
                />
            )}
            <p
                className={cn(
                    "text-[11px] font-semibold uppercase tracking-wide",
                    data.accent
                )}
            >
                {data.roleLabel}
            </p>
            <p className="font-semibold text-base mt-1">{data.title}</p>
            <p className="text-sm text-muted-foreground mt-1.5 line-clamp-3 leading-snug">
                {data.subtitle}
            </p>
            <Handle
                type="source"
                position={Position.Bottom}
                className="!bg-muted-foreground !w-2 !h-2"
            />
        </div>
    );
});

const nodeTypes: NodeTypes = {
    alertStep: AlertStepNode
};

const ACTION_NODE_X_GAP = 280;
const ACTION_NODE_Y = 468;
const SOURCE_NODE_POS = { x: 120, y: 28 };
const TRIGGER_NODE_POS = { x: 120, y: 248 };

function buildNodeData(
    stepId: "source" | "trigger",
    v: AlertRuleFormValues,
    t: AlertRuleT
): AlertStepNodeData {
    const accents: Record<
        "source" | "trigger",
        { accent: string; topBorderClass: string; role: string; title: string }
    > = {
        source: {
            accent: "text-blue-600 dark:text-blue-400",
            topBorderClass: "border-t-blue-500",
            role: t("alertingNodeRoleSource"),
            title: t("alertingSectionSource")
        },
        trigger: {
            accent: "text-emerald-600 dark:text-emerald-400",
            topBorderClass: "border-t-emerald-500",
            role: t("alertingNodeRoleTrigger"),
            title: t("alertingSectionTrigger")
        }
    };
    const meta = accents[stepId];
    const subtitle =
        stepId === "source"
            ? summarizeSource(v, t)
            : summarizeTrigger(v, t);
    return {
        roleLabel: meta.role,
        title: meta.title,
        subtitle,
        configured: stepConfigured(stepId, v),
        accent: meta.accent,
        topBorderClass: meta.topBorderClass
    };
}

type AlertRuleGraphEditorProps = {
    orgId: string;
    alertRuleId?: number;
    initialValues: AlertRuleFormValues;
    isNew: boolean;
    disabled?: boolean;
};

const FORM_ID = "alert-rule-graph-form";

export default function AlertRuleGraphEditor({
    orgId,
    alertRuleId,
    initialValues,
    isNew,
    disabled = false
}: AlertRuleGraphEditorProps) {
    const t = useTranslations();
    const router = useRouter();
    const api = createApiClient(useEnvContext());
    const [isSaving, setIsSaving] = useState(false);
    const schema = useMemo(() => buildFormSchema(t), [t]);
    const form = useForm<AlertRuleFormValues>({
        resolver: zodResolver(schema),
        defaultValues: initialValues ?? defaultFormValues()
    });

    const { fields, append, remove, update } = useFieldArray({
        control: form.control,
        name: "actions"
    });

    const wName = useWatch({ control: form.control, name: "name" }) ?? "";
    const wEnabled =
        useWatch({ control: form.control, name: "enabled" }) ?? true;
    const wSourceType =
        useWatch({ control: form.control, name: "sourceType" }) ?? "site";
    const wSiteIds =
        useWatch({ control: form.control, name: "siteIds" }) ?? [];
    const wHealthCheckIds =
        useWatch({ control: form.control, name: "healthCheckIds" }) ?? [];
    const wTrigger =
        useWatch({ control: form.control, name: "trigger" }) ??
        "site_offline";
    const wActions =
        useWatch({ control: form.control, name: "actions" }) ?? [];

    const flowValues: AlertRuleFormValues = useMemo(
        () => ({
            name: wName,
            enabled: wEnabled,
            sourceType: wSourceType,
            siteIds: wSiteIds,
            healthCheckIds: wHealthCheckIds,
            trigger: wTrigger,
            actions: wActions
        }),
        [
            wName,
            wEnabled,
            wSourceType,
            wSiteIds,
            wHealthCheckIds,
            wTrigger,
            wActions
        ]
    );

    const [selectedStep, setSelectedStep] = useState<string>("source");

    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

    const nodesSyncKeyRef = useRef("");
    useEffect(() => {
        const key = JSON.stringify({ flowValues, selectedStep });
        if (key === nodesSyncKeyRef.current) {
            return;
        }
        nodesSyncKeyRef.current = key;

        const nActions = flowValues.actions.length;
        const actionNodes: Node[] =
            nActions === 0
                ? [
                      {
                          id: "actions",
                          type: "alertStep",
                          position: {
                              x: TRIGGER_NODE_POS.x,
                              y: ACTION_NODE_Y
                          },
                          data: buildActionsPlaceholderNodeData(t),
                          selected:
                              selectedStep === "actions" ||
                              selectedStep.startsWith("action-")
                      }
                  ]
                : flowValues.actions.map((action, i) => {
                      const totalWidth =
                          (nActions - 1) * ACTION_NODE_X_GAP;
                      const originX =
                          TRIGGER_NODE_POS.x - totalWidth / 2;
                      return {
                          id: `action-${i}`,
                          type: "alertStep",
                          position: {
                              x: originX + i * ACTION_NODE_X_GAP,
                              y: ACTION_NODE_Y
                          },
                          data: buildActionStepNodeData(i, action, t),
                          selected: selectedStep === `action-${i}`
                      };
                  });

        setNodes([
            {
                id: "source",
                type: "alertStep",
                position: SOURCE_NODE_POS,
                data: buildNodeData("source", flowValues, t),
                selected: selectedStep === "source"
            },
            {
                id: "trigger",
                type: "alertStep",
                position: TRIGGER_NODE_POS,
                data: buildNodeData("trigger", flowValues, t),
                selected: selectedStep === "trigger"
            },
            ...actionNodes
        ]);

        const nextEdges: Edge[] = [
            {
                id: "e-src-trg",
                source: "source",
                target: "trigger",
                animated: true
            },
            ...(nActions === 0
                ? [
                      {
                          id: "e-trg-act",
                          source: "trigger",
                          target: "actions",
                          animated: true
                      } as const
                  ]
                : flowValues.actions.map((_, i) => ({
                      id: `e-trg-act-${i}`,
                      source: "trigger",
                      target: `action-${i}`,
                      animated: true
                  })))
        ];
        setEdges(nextEdges);
    }, [flowValues, selectedStep, t, setNodes, setEdges]);

    useEffect(() => {
        if (selectedStep === "actions" && wActions.length > 0) {
            setSelectedStep("action-0");
        }
    }, [selectedStep, wActions.length]);

    useEffect(() => {
        if (wActions.length === 0 && /^action-\d+$/.test(selectedStep)) {
            setSelectedStep("actions");
        }
    }, [wActions.length, selectedStep]);

    useEffect(() => {
        const m = /^action-(\d+)$/.exec(selectedStep);
        if (!m) {
            return;
        }
        const i = parseInt(m[1], 10);
        if (i >= wActions.length) {
            setSelectedStep(
                wActions.length > 0
                    ? `action-${wActions.length - 1}`
                    : "actions"
            );
        }
    }, [wActions.length, selectedStep]);

    const onNodeClick = useCallback((_event: unknown, node: Node) => {
        setSelectedStep(node.id);
    }, []);

    const onSubmit = form.handleSubmit(async (values) => {
        setIsSaving(true);
        try {
            const payload = formValuesToApiPayload(values);
            if (isNew) {
                const res = await api.put<
                    AxiosResponse<CreateAlertRuleResponse>
                >(`/org/${orgId}/alert-rule`, payload);
                toast({ title: t("alertingRuleSaved") });
                router.replace(
                    `/${orgId}/settings/alerting/${res.data.data.alertRuleId}`
                );
            } else {
                await api.post(
                    `/org/${orgId}/alert-rule/${alertRuleId}`,
                    payload
                );
                toast({ title: t("alertingRuleSaved") });
            }
        } catch (e) {
            toast({
                title: t("error"),
                description: formatAxiosError(e),
                variant: "destructive"
            });
        } finally {
            setIsSaving(false);
        }
    });

    const isActionsSidebar =
        selectedStep === "actions" || selectedStep.startsWith("action-");

    const sidebarTitle = isActionsSidebar
        ? t("alertingConfigureActions")
        : selectedStep === "source"
          ? t("alertingConfigureSource")
          : t("alertingConfigureTrigger");

    return (
        <Form {...form}>
            <form id={FORM_ID} onSubmit={onSubmit}>
                <SettingsContainer>
                    <PaidFeaturesAlert tiers={tierMatrix.alertingRules} />
                    <Card>
                        <CardContent className="p-4 sm:p-5 space-y-4">
                            <fieldset
                                disabled={disabled}
                                className={disabled ? "opacity-50 pointer-events-none" : ""}
                            >
                            <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-center">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button variant="outline" size="sm" asChild>
                                        <Link href={`/${orgId}/settings/alerting`}>
                                            <ChevronLeft className="h-4 w-4 mr-1" />
                                            {t("alertingBackToRules")}
                                        </Link>
                                    </Button>
                                    {isNew && (
                                        <span className="text-xs rounded-md border bg-muted px-2 py-1 text-muted-foreground">
                                            {t("alertingDraftBadge")}
                                        </span>
                                    )}
                                </div>
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem className="flex-1 min-w-0 md:min-w-[12rem] md:max-w-md">
                                            <FormLabel className="sr-only">
                                                {t("name")}
                                            </FormLabel>
                                            <FormControl>
                                                <Input
                                                    {...field}
                                                    placeholder={t(
                                                        "alertingRuleNamePlaceholder"
                                                    )}
                                                    className="font-medium"
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <div className="flex flex-wrap items-center gap-3 md:ml-auto">
                                    <FormField
                                        control={form.control}
                                        name="enabled"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-row items-center gap-2 space-y-0">
                                                <FormLabel className="text-sm font-normal cursor-pointer whitespace-nowrap">
                                                    {t("alertingRuleEnabled")}
                                                </FormLabel>
                                                <FormControl>
                                                    <Switch
                                                        checked={field.value}
                                                        onCheckedChange={
                                                            field.onChange
                                                        }
                                                    />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                    <Button type="submit" disabled={isSaving}>
                                        {isSaving ? t("saving") : t("save")}
                                    </Button>
                                </div>
                            </div>
                            </fieldset>
                        </CardContent>
                    </Card>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                        <Card className="flex flex-col w-full overflow-hidden">
                            <CardHeader className="pb-2 pt-5 px-5 space-y-1 sm:px-6">
                                <CardTitle className="text-lg font-bold tracking-tight">
                                    {t("alertingGraphCanvasTitle")}
                                </CardTitle>
                                <CardDescription className="pt-0">
                                    {t("alertingGraphCanvasDescription")}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="p-4 sm:p-5 sm:px-6 pt-0">
                                <div
                                    className={cn(
                                        "rounded-md border bg-muted/30 overflow-hidden",
                                        "min-h-[min(66vh,560px)] lg:min-h-[680px]"
                                    )}
                                >
                                    <ReactFlowProvider>
                                        <ReactFlow
                                            nodes={nodes}
                                            edges={edges}
                                            onNodesChange={onNodesChange}
                                            onEdgesChange={onEdgesChange}
                                            nodeTypes={nodeTypes}
                                            onNodeClick={onNodeClick}
                                            fitView
                                            fitViewOptions={{
                                                padding: 0.35
                                            }}
                                            minZoom={0.5}
                                            maxZoom={1.25}
                                            nodesDraggable={false}
                                            nodesConnectable={false}
                                            elementsSelectable
                                            panOnScroll
                                            zoomOnScroll
                                            proOptions={{
                                                hideAttribution: true
                                            }}
                                            className="bg-transparent !h-full !w-full min-h-[min(66vh,560px)] lg:min-h-[680px]"
                                        >
                                            <Background gap={16} size={1} />
                                        </ReactFlow>
                                    </ReactFlowProvider>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="flex flex-col w-full">
                            <CardHeader className="pb-2 pt-5 px-5 space-y-1 sm:px-6">
                                <CardTitle className="text-lg font-bold tracking-tight">
                                    {sidebarTitle}
                                </CardTitle>
                                <CardDescription className="pt-0">
                                    {t("alertingSidebarHint")}
                                </CardDescription>
                            </CardHeader>
                        <CardContent className="p-4 sm:p-5 sm:px-6 pt-0">
                        <fieldset
                            disabled={disabled}
                            className={disabled ? "opacity-50 pointer-events-none" : ""}
                        >
                        <div className="space-y-6">
                            {selectedStep === "source" && (
                                <AlertRuleSourceFields
                                    orgId={orgId}
                                    control={form.control}
                                />
                            )}
                            {selectedStep === "trigger" && (
                                <AlertRuleTriggerFields
                                    control={form.control}
                                />
                            )}
                            {isActionsSidebar && (
                                <div className="space-y-4">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <span className="text-sm font-medium">
                                                    {t(
                                                        "alertingSectionActions"
                                                    )}
                                                </span>
                                                <DropdownAddAction
                                                    onAdd={(type) => {
                                                        const newIndex =
                                                            fields.length;
                                                        if (type === "notify") {
                                                            append({
                                                                type: "notify",
                                                                userTags: [],
                                                                roleTags: [],
                                                                emailTags: []
                                                            });
                                                        } else {
                                                            append({
                                                                type: "webhook",
                                                                url: "",
                                                                method: "POST",
                                                                headers: [
                                                                    {
                                                                        key: "",
                                                                        value: ""
                                                                    }
                                                                ],
                                                                authType: "none",
                                                                bearerToken: "",
                                                                basicCredentials: "",
                                                                customHeaderName: "",
                                                                customHeaderValue: ""
                                                            });
                                                        }
                                                        setSelectedStep(
                                                            `action-${newIndex}`
                                                        );
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
                                                    onRemove={() =>
                                                        remove(index)
                                                    }
                                                    onUpdate={(val) =>
                                                        update(index, val)
                                                    }
                                                    canRemove
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                                </fieldset>
                            </CardContent>
                        </Card>
                    </div>
                </SettingsContainer>
            </form>
        </Form>
    );
}
