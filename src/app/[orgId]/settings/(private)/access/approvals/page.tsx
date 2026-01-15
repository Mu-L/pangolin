import { ApprovalFeed } from "@app/components/ApprovalFeed";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import { internal } from "@app/lib/api";
import { authCookieHeader } from "@app/lib/api/cookies";
import { getCachedOrg } from "@app/lib/api/getCachedOrg";
import OrgProvider from "@app/providers/OrgProvider";
import type { GetOrgResponse } from "@server/routers/org";
import type { AxiosResponse } from "axios";
import { getTranslations } from "next-intl/server";

export interface ApprovalFeedPageProps {
    params: Promise<{ orgId: string }>;
}

type ApprovalItem = {
    approvalId: number;
    orgId: string;
    clientId: number | null;
    decision: "pending" | "approved" | "denied";
    type: "user_device";
    user: {
        name: string | null;
        userId: string;
        username: string;
    };
};

export default async function ApprovalFeedPage(props: ApprovalFeedPageProps) {
    const params = await props.params;

    let approvals: ApprovalItem[] = [];
    const res = await internal
        .get<
            AxiosResponse<{ approvals: ApprovalItem[] }>
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
                <div className="container mx-auto max-w-12xl">
                    <ApprovalFeed orgId={params.orgId} />
                </div>
            </OrgProvider>
        </>
    );
}
