import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import { getCachedOrg } from "@app/lib/api/getCachedOrg";
import type { GetOrgResponse } from "@server/routers/org";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

export interface CreateResourcePolicyPageProps {
    params: Promise<{ orgId: string }>;
}

export default async function CreateResourcePolicyPage(
    props: CreateResourcePolicyPageProps
) {
    const params = await props.params;
    const t = await getTranslations();

    let org: GetOrgResponse | null = null;
    try {
        const res = await getCachedOrg(params.orgId);
        org = res.data.data;
    } catch {
        redirect(`/${params.orgId}/settings/resources`);
    }
    return (
        <>
            <SettingsSectionTitle
                title={t("resourcePoliciesCreate")}
                description={t("resourcePoliciesCreateDescription")}
            />
        </>
    );
}
