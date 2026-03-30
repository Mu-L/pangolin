"use client";

import AlertRuleGraphEditor from "@app/components/alert-rule-editor/AlertRuleGraphEditor";
import { defaultFormValues } from "@app/lib/alertRuleForm";
import { isoNow, newRuleId } from "@app/lib/alertRulesLocalStorage";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

export default function NewAlertRulePage() {
    const t = useTranslations();
    const params = useParams();
    const orgId = params.orgId as string;
    const [meta, setMeta] = useState<{ id: string; createdAt: string } | null>(
        null
    );

    useEffect(() => {
        setMeta({ id: newRuleId(), createdAt: isoNow() });
    }, []);

    if (!meta) {
        return (
            <div className="min-h-[12rem] flex items-center justify-center text-muted-foreground text-sm">
                {t("loading")}
            </div>
        );
    }

    return (
        <AlertRuleGraphEditor
            key={meta.id}
            orgId={orgId}
            ruleId={meta.id}
            createdAt={meta.createdAt}
            initialValues={defaultFormValues()}
            isNew
        />
    );
}
