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

import { createPolicyRulesSectionSchema, type PolicyFormValues } from ".";
import { Button } from "@app/components/ui/button";
import { Plus } from "lucide-react";

import { useCallback, useEffect, useMemo, useState } from "react";
import { type UseFormReturn, useForm, useWatch } from "react-hook-form";

import { PolicyAccessRulesIntro } from "./PolicyAccessRulesIntro";
import { PolicyAccessRulesTable } from "./PolicyAccessRulesTable";
import {
    createEmptyRule,
    type PolicyAccessRule
} from "./policy-access-rule-utils";

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
    const [rules, setRules] = useState<PolicyAccessRule[]>([]);

    const rulesFormSchema = useMemo(
        () => createPolicyRulesSectionSchema(t),
        [t]
    );

    const form = useForm({
        resolver: zodResolver(rulesFormSchema),
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
            const updatedRules = rules.filter((rule) => rule.ruleId !== ruleId);
            setRules(updatedRules);
            syncFormRules(updatedRules);
        },
        [rules, syncFormRules]
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

    const addRuleButton = (
        <Button type="button" variant="outline" onClick={addEmptyRule}>
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
                <div className="flex flex-col gap-y-6 pb-20">
                    <PolicyAccessRulesIntro
                        rulesEnabled={Boolean(rulesEnabled)}
                        onRulesEnabledChange={(val) => {
                            form.setValue("applyRules", val);
                        }}
                    />

                    {rulesEnabled && (
                        <>
                            <PolicyAccessRulesTable
                                rules={rules}
                                onRulesChange={handleRulesChange}
                                updateRule={updateRule}
                                removeRule={removeRule}
                                isMaxmindAvailable={isMaxmindAvailable}
                                isMaxmindAsnAvailable={isMaxmindAsnAvailable}
                                includeRegionMatch={false}
                                emptyStateAction={addRuleButton}
                            />
                            {hasRules && addRuleButton}
                        </>
                    )}
                </div>
            </SettingsSectionBody>
        </SettingsSection>
    );
}
