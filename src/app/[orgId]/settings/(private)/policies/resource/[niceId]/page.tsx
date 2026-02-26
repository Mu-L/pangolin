import { EditPolicyForm } from "@app/components/resource-policy/EditPolicyForm";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import { Button } from "@app/components/ui/button";
import { internal } from "@app/lib/api";
import { authCookieHeader } from "@app/lib/api/cookies";
import type { ResourcePolicy } from "@server/db";
import type { GetResourcePolicyResponse } from "@server/routers/policy";
import type { AxiosResponse } from "axios";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export interface EditPolicyPageProps {
    params: Promise<{ niceId: string; orgId: string }>;
}

export default async function EditPolicyPage(props: EditPolicyPageProps) {
    const params = await props.params;
    const t = await getTranslations();

    let policy: ResourcePolicy | null = null;
    try {
        const res = await internal.get<
            AxiosResponse<GetResourcePolicyResponse>
        >(
            `/org/${params.orgId}/resource-policy/${params.niceId}`,
            await authCookieHeader()
        );
        policy = res.data.data.policy;
    } catch {
        redirect(`/${params.orgId}/settings/policies/resource`);
    }

    if (!policy) {
        redirect(`/${params.orgId}/settings/policies/resource`);
    }

    return (
        <>
            <div className="flex justify-between">
                <SettingsSectionTitle
                    title={t("resourcePolicySetting", {
                        policyName: policy.name
                    })}
                    description={t("resourcePolicySettingDescription")}
                />

                <Button asChild variant="outline">
                    <Link href={`/${params.orgId}/settings/policies/resource`}>
                        {t("resourcePoliciesSeeAll")}
                    </Link>
                </Button>
            </div>

            <EditPolicyForm policy={policy} />
        </>
    );
}
