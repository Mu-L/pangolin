import { CreatePolicyForm } from "@app/components/resource-policy/CreatePolicyForm";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import { Button } from "@app/components/ui/button";
import { getCachedOrg } from "@app/lib/api/getCachedOrg";
import OrgProvider from "@app/providers/OrgProvider";
import type { GetOrgResponse } from "@server/routers/org";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
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
            <div className="flex justify-between">
                <SettingsSectionTitle
                    title={t("resourcePoliciesCreate")}
                    description={t("resourcePoliciesCreateDescription")}
                />

                <Button asChild variant="outline">
                    <Link href={`/${params.orgId}/settings/resources/policies`}>
                        {t("resourcePoliciesSeeAll")}
                    </Link>
                </Button>
            </div>

            <OrgProvider org={org}>
                <CreatePolicyForm />
            </OrgProvider>
        </>
    );
}
