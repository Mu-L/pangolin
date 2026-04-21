import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import { HorizontalTabs } from "@app/components/HorizontalTabs";
import { getTranslations } from "next-intl/server";

type AlertingLayoutProps = {
    children: React.ReactNode;
    params: Promise<{ orgId: string }>;
};

export default async function AlertingLayout({
    children,
    params
}: AlertingLayoutProps) {
    const { orgId } = await params;
    const t = await getTranslations();

    const navItems = [
        {
            title: t("alertingTabRules"),
            href: `/${orgId}/settings/alerting/rules`,
            activePrefix: `/${orgId}/settings/alerting`
        },
        {
            title: t("alertingTabHealthChecks"),
            href: `/${orgId}/settings/alerting/health-checks`
        }
    ];

    return (
        <>
            <SettingsSectionTitle
                title={t("alertingTitle")}
                description={t("alertingDescription")}
            />
            <HorizontalTabs items={navItems}>{children}</HorizontalTabs>
        </>
    );
}
