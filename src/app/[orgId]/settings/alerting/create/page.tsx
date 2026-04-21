"use client";

import AlertRuleGraphEditor from "@app/components/alert-rule-editor/AlertRuleGraphEditor";
import HeaderTitle from "@app/components/SettingsSectionTitle";
import { defaultFormValues } from "@app/lib/alertRuleForm";
import { usePaidStatus } from "@app/hooks/usePaidStatus";
import { tierMatrix } from "@server/lib/billing/tierMatrix";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";

export default function NewAlertRulePage() {
    const params = useParams();
    const orgId = params.orgId as string;
    const t = useTranslations();
    const { isPaidUser } = usePaidStatus();
    const isPaid = isPaidUser(tierMatrix.alertingRules);

    return (
        <>
            <HeaderTitle
                title={t("alertingCreateRule")}
                description={t("alertingRuleCredenzaDescription")}
            />
            <AlertRuleGraphEditor
                orgId={orgId}
                initialValues={defaultFormValues()}
                isNew
                disabled={!isPaid}
            />
        </>
    );
}
