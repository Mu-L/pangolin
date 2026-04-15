"use client";

import AlertRuleGraphEditor from "@app/components/alert-rule-editor/AlertRuleGraphEditor";
import { defaultFormValues } from "@app/lib/alertRuleForm";
import { useParams } from "next/navigation";

export default function NewAlertRulePage() {
    const params = useParams();
    const orgId = params.orgId as string;

    return (
        <AlertRuleGraphEditor
            orgId={orgId}
            initialValues={defaultFormValues()}
            isNew
        />
    );
}