import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import AlertingRulesTable from "@app/components/AlertingRulesTable";
import StandaloneHealthChecksTable from "@app/components/StandaloneHealthChecksTable";
import { HorizontalTabs, TabItem } from "@app/components/HorizontalTabs";
import { getTranslations } from "next-intl/server";

type AlertingPageProps = {
    params: Promise<{ orgId: string }>;
};

export const dynamic = "force-dynamic";

export default async function AlertingPage(props: AlertingPageProps) {
    const params = await props.params;
    const t = await getTranslations();

    const tabs: TabItem[] = [
        { title: t("alertingTabRules"), href: "" },
        { title: t("alertingTabHealthChecks"), href: "" }
    ];

    return (
        <>
            <SettingsSectionTitle
                title={t("alertingTitle")}
                description={t("alertingDescription")}
            />
            <HorizontalTabs items={tabs} clientSide>
                <AlertingRulesTable orgId={params.orgId} />
                <StandaloneHealthChecksTable orgId={params.orgId} />
            </HorizontalTabs>
        </>
    );
}