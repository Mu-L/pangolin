import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import AlertingRulesTable from "@app/components/AlertingRulesTable";
import { getTranslations } from "next-intl/server";

type AlertingPageProps = {
    params: Promise<{ orgId: string }>;
};

export const dynamic = "force-dynamic";

export default async function AlertingPage(props: AlertingPageProps) {
    const params = await props.params;
    const t = await getTranslations();

    return (
        <>
            <SettingsSectionTitle
                title={t("alertingTitle")}
                description={t("alertingDescription")}
            />
            <AlertingRulesTable orgId={params.orgId} />
        </>
    );
}
