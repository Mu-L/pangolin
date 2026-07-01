import { Layout } from "@app/components/Layout";
import ResourceLauncher from "@app/components/resource-launcher/ResourceLauncher";
import { internal } from "@app/lib/api";
import { authCookieHeader } from "@app/lib/api/cookies";
import { verifySession } from "@app/lib/auth/verifySession";
import { pullEnv } from "@app/lib/pullEnv";
import UserProvider from "@app/providers/UserProvider";
import { ListUserOrgsResponse } from "@server/routers/org";
import { GetOrgOverviewResponse } from "@server/routers/org/getOrgOverview";
import { AxiosResponse } from "axios";
import { redirect } from "next/navigation";
import { cache } from "react";

type OrgPageProps = {
    params: Promise<{ orgId: string }>;
};

export default async function OrgPage(props: OrgPageProps) {
    const params = await props.params;
    const orgId = params.orgId;

    if (!orgId) {
        redirect(`/`);
    }

    const getUser = cache(verifySession);
    const user = await getUser();

    if (!user) {
        redirect("/");
    }

    let overview: GetOrgOverviewResponse | undefined;
    try {
        const res = await internal.get<AxiosResponse<GetOrgOverviewResponse>>(
            `/org/${orgId}/overview`,
            await authCookieHeader()
        );
        overview = res.data.data;
    } catch (e) {}

    let orgs: ListUserOrgsResponse["orgs"] = [];
    try {
        const getOrgs = cache(async () =>
            internal.get<AxiosResponse<ListUserOrgsResponse>>(
                `/user/${user.userId}/orgs`,
                await authCookieHeader()
            )
        );
        const res = await getOrgs();
        if (res && res.data.data.orgs) {
            orgs = res.data.data.orgs;
        }
    } catch (e) {}

    const isAdminOrOwner = Boolean(overview?.isAdmin || overview?.isOwner);

    return (
        <UserProvider user={user}>
            <Layout
                orgId={orgId}
                orgs={orgs}
                navItems={[]}
                showSidebar={false}
                launcherMode
                showViewAsAdmin={isAdminOrOwner}
            >
                {overview ? (
                    <ResourceLauncher orgId={orgId} isAdmin={isAdminOrOwner} />
                ) : null}
            </Layout>
        </UserProvider>
    );
}
