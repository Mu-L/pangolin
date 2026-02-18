import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import { verifySession } from "@app/lib/auth/verifySession";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getTranslations } from "next-intl/server";
import { build } from "@server/build";
import { getCachedOrgUser } from "@app/lib/api/getCachedOrgUser";
import { getCachedOrg } from "@app/lib/api/getCachedOrg";

type LicensesSettingsProps = {
    children: React.ReactNode;
    params: Promise<{ orgId: string }>;
};

export default async function LicensesSetingsLayoutProps({
    children,
    params
}: LicensesSettingsProps) {
    const { orgId } = await params;

    if (build !== "saas") {
        redirect(`/${orgId}/settings`);
    }

    const getUser = cache(verifySession);
    const user = await getUser();

    if (!user) {
        redirect(`/`);
    }

    let orgUser = null;
    try {
        const res = await getCachedOrgUser(orgId, user.userId);
        orgUser = res.data.data;
    } catch {
        redirect(`/${orgId}`);
    }

    let org = null;
    try {
        const res = await getCachedOrg(orgId);
        org = res.data.data;
    } catch {
        redirect(`/${orgId}`);
    }

    if (!org?.org?.isBillingOrg || !orgUser?.isOwner) {
        redirect(`/${orgId}`);
    }

    const t = await getTranslations();

    return (
        <>
            <SettingsSectionTitle
                title={t("saasLicenseKeysSettingsTitle")}
                description={t("saasLicenseKeysSettingsDescription")}
            />

            {children}
        </>
    );
}
