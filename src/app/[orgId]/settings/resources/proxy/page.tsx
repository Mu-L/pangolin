import type { ResourceRow } from "@app/components/ProxyResourcesTable";
import ProxyResourcesTable from "@app/components/ProxyResourcesTable";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import ProxyResourcesBanner from "@app/components/ProxyResourcesBanner";
import { internal } from "@app/lib/api";
import { authCookieHeader } from "@app/lib/api/cookies";
import OrgProvider from "@app/providers/OrgProvider";
import type { GetOrgResponse } from "@server/routers/org";
import type { ListResourcesResponse } from "@server/routers/resource";
import type { ListAllSiteResourcesByOrgResponse } from "@server/routers/siteResource";
import type { AxiosResponse } from "axios";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { toUnicode } from "punycode";
import { cache } from "react";

export interface ProxyResourcesPageProps {
    params: Promise<{ orgId: string }>;
    searchParams: Promise<{ view?: string }>;
}

export default async function ProxyResourcesPage(
    props: ProxyResourcesPageProps
) {
    const params = await props.params;
    const t = await getTranslations();

    let resources: ListResourcesResponse["resources"] = [];
    try {
        const res = await internal.get<AxiosResponse<ListResourcesResponse>>(
            `/org/${params.orgId}/resources`,
            await authCookieHeader()
        );
        resources = res.data.data.resources;
    } catch (e) {}

    let siteResources: ListAllSiteResourcesByOrgResponse["siteResources"] = [];
    try {
        const res = await internal.get<
            AxiosResponse<ListAllSiteResourcesByOrgResponse>
        >(`/org/${params.orgId}/site-resources`, await authCookieHeader());
        siteResources = res.data.data.siteResources;
    } catch (e) {}

    let org = null;
    try {
        const getOrg = cache(async () =>
            internal.get<AxiosResponse<GetOrgResponse>>(
                `/org/${params.orgId}`,
                await authCookieHeader()
            )
        );
        const res = await getOrg();
        org = res.data.data;
    } catch {
        redirect(`/${params.orgId}/settings/resources`);
    }

    if (!org) {
        redirect(`/${params.orgId}/settings/resources`);
    }

    const resourceRows: ResourceRow[] = resources.map((resource) => {
        return {
            id: resource.resourceId,
            name: resource.name,
            orgId: params.orgId,
            nice: resource.niceId,
            domain: `${resource.ssl ? "https://" : "http://"}${toUnicode(resource.fullDomain || "")}`,
            protocol: resource.protocol,
            proxyPort: resource.proxyPort,
            http: resource.http,
            authState: !resource.http
                ? "none"
                : resource.sso ||
                    resource.pincodeId !== null ||
                    resource.passwordId !== null ||
                    resource.whitelist ||
                    resource.headerAuthId
                  ? "protected"
                  : "not_protected",
            enabled: resource.enabled,
            domainId: resource.domainId || undefined,
            ssl: resource.ssl,
            targets: resource.targets?.map((target) => ({
                targetId: target.targetId,
                ip: target.ip,
                port: target.port,
                enabled: target.enabled,
                healthStatus: target.healthStatus
            }))
        };
    });
    return (
        <>
            <SettingsSectionTitle
                title={t("proxyResourceTitle")}
                description={t("proxyResourceDescription")}
            />

            <ProxyResourcesBanner />

            <OrgProvider org={org}>
                <ProxyResourcesTable
                    resources={resourceRows}
                    orgId={params.orgId}
                    defaultSort={{
                        id: "name",
                        desc: false
                    }}
                />
            </OrgProvider>
        </>
    );
}
