import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import { getTranslations } from "next-intl/server";

export interface OrganizationsPageProps {}

export default async function OrganizationsPage(props: OrganizationsPageProps) {
    const t = await getTranslations();

    return (
        <>
            <SettingsSectionTitle
                title={t("orgsManage")}
                description={t("orgsDescription")}
            />
        </>
    );
}
