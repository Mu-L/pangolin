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
    validatePolicyRulesForSave,
    type PolicyFormValues
} from ".";

import { Button } from "@app/components/ui/button";
import { Plus } from "lucide-react";

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
import { PolicyAccessRulesTable } from "./PolicyAccessRulesTable";
import {
    createEmptyRule,
    type PolicyAccessRule
} from "./policy-access-rule-utils";

// ─── PolicyRulesSection ───────────────────────────────────────────────────────

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

    const [rules, setRules] = useState<PolicyAccessRule[]>(
        policy.rules.map((r) => ({ ...r, fromPolicy: isResourceOverlay }))
    );

    useEffect(() => {
        if (!isResourceOverlay || resourceRulesInitialized) return;
        if (!resourceRulesData) return;

        const policyRuleIds = new Set(policy.rules.map((r) => r.ruleId));
        const resourceSpecific: PolicyAccessRule[] = resourceRulesData
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

    const syncFormRules = useCallback(
        (updatedRules: PolicyAccessRule[]) => {
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
            if (!rule || rule.fromPolicy) return;
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
        function updateRule(ruleId: number, data: Partial<PolicyAccessRule>) {
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

    const handleRulesChange = useCallback(
        (updatedRules: PolicyAccessRule[]) => {
            setRules(updatedRules);
            syncFormRules(updatedRules);
        },
        [syncFormRules]
    );

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

    const hasRules = rules.length > 0;

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
                            <PolicyAccessRulesTable
                                rules={rules}
                                onRulesChange={handleRulesChange}
                                updateRule={updateRule}
                                removeRule={removeRule}
                                readonly={readonly}
                                isMaxmindAvailable={isMaxmindAvailable}
                                isMaxmindAsnAvailable={isMaxmindAsnAvailable}
                                includeRegionMatch
                                markUpdatedOnReorder
                                emptyStateAction={addRuleButton}
                            />
                            {hasRules && addRuleButton}
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
