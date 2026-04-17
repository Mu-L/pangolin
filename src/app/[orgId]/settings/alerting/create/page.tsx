"use client";

import AlertRuleGraphEditor from "@app/components/alert-rule-editor/AlertRuleGraphEditor";
import { defaultFormValues } from "@app/lib/alertRuleForm";
import { usePaidStatus } from "@app/hooks/usePaidStatus";
import { tierMatrix } from "@server/lib/billing/tierMatrix";
import { useParams } from "next/navigation";

export default function NewAlertRulePage() {
    const params = useParams();
    const orgId = params.orgId as string;
    const { isPaidUser } = usePaidStatus();
    const isPaid = isPaidUser(tierMatrix.alertingRules);

    return (
        <AlertRuleGraphEditor
            orgId={orgId}
            initialValues={defaultFormValues()}
            isNew
            disabled={!isPaid}
        />
    );
}