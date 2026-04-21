import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import AlertingRulesTable from "@app/components/AlertingRulesTable";
import HealthChecksTable from "@app/components/HealthChecksTable";
import DismissableBanner from "@app/components/DismissableBanner";
import { HorizontalTabs, TabItem } from "@app/components/HorizontalTabs";
import { BellRing, HeartPulse } from "lucide-react";
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
                <div className="space-y-6">
                    <DismissableBanner
                        storageKey="alerting-rules-banner-dismissed"
                        version={1}
                        title={t("alertingRulesBannerTitle")}
                        titleIcon={
                            <BellRing className="w-5 h-5 text-primary shrink-0" />
                        }
                        description={t("alertingRulesBannerDescription")}
                    />
                    <AlertingRulesTable orgId={params.orgId} />
                </div>
                <div className="space-y-6">
                    <DismissableBanner
                        storageKey="alerting-health-checks-banner-dismissed"
                        version={1}
                        title={t("alertingHealthChecksBannerTitle")}
                        titleIcon={
                            <HeartPulse className="w-5 h-5 text-primary shrink-0" />
                        }
                        description={t("alertingHealthChecksBannerDescription")}
                    />
                    <HealthChecksTable orgId={params.orgId} />
                </div>
            </HorizontalTabs>
        </>
    );
}
