"use client";

import AlertRuleGraphEditor from "@app/components/alert-rule-editor/AlertRuleGraphEditor";
import { ruleToFormValues } from "@app/lib/alertRuleForm";
import type { AlertRule } from "@app/lib/alertRulesLocalStorage";
import { getRule } from "@app/lib/alertRulesLocalStorage";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

export default function EditAlertRulePage() {
    const t = useTranslations();
    const params = useParams();
    const router = useRouter();
    const orgId = params.orgId as string;
    const ruleId = params.ruleId as string;
    const [rule, setRule] = useState<AlertRule | null | undefined>(undefined);

    useEffect(() => {
        const r = getRule(orgId, ruleId);
        setRule(r ?? null);
    }, [orgId, ruleId]);

    useEffect(() => {
        if (rule === null) {
            router.replace(`/${orgId}/settings/alerting`);
        }
    }, [rule, orgId, router]);

    if (rule === undefined) {
        return (
            <div className="min-h-[12rem] flex items-center justify-center text-muted-foreground text-sm">
                {t("loading")}
            </div>
        );
    }

    if (rule === null) {
        return null;
    }

    return (
        <AlertRuleGraphEditor
            key={rule.id}
            orgId={orgId}
            ruleId={rule.id}
            createdAt={rule.createdAt}
            initialValues={ruleToFormValues(rule)}
            isNew={false}
        />
    );
}
