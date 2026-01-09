import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import { internal } from "@app/lib/api";
import { authCookieHeader } from "@app/lib/api/cookies";
import { getCachedOrg } from "@app/lib/api/getCachedOrg";
import OrgProvider from "@app/providers/OrgProvider";
import type { ListApprovalsResponse } from "@server/private/routers/approvals";
import type { GetOrgResponse } from "@server/routers/org";
import type { AxiosResponse } from "axios";
import { getTranslations } from "next-intl/server";

export interface ApprovalFeedPageProps {
    params: Promise<{ orgId: string }>;
}

export default async function ApprovalFeedPage(props: ApprovalFeedPageProps) {
    const params = await props.params;

    let approvals: ListApprovalsResponse["approvals"] = [];
    const res = await internal
        .get<
            AxiosResponse<ListApprovalsResponse>
        >(`/org/${params.orgId}/approvals`, await authCookieHeader())
        .catch((e) => {});

    if (res && res.status === 200) {
        approvals = res.data.data.approvals;
    }

    let org: GetOrgResponse | null = null;
    const orgRes = await getCachedOrg(params.orgId);

    if (orgRes && orgRes.status === 200) {
        org = orgRes.data.data;
    }

    const t = await getTranslations();

    return (
        <>
            <SettingsSectionTitle
                title={t("accessApprovalsManage")}
                description={t("accessApprovalsDescription")}
            />
            <OrgProvider org={org}>
                <h1>Orgs</h1>
            </OrgProvider>
        </>
    );
}
