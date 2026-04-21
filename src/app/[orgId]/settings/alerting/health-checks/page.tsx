import HealthChecksTable from "@app/components/HealthChecksTable";
import DismissableBanner from "@app/components/DismissableBanner";
import { internal } from "@app/lib/api";
import { authCookieHeader } from "@app/lib/api/cookies";
import { ListHealthChecksResponse } from "@server/routers/healthChecks/types";
import { AxiosResponse } from "axios";
import { HeartPulse } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = {
    title: "Health checks"
};

type AlertingHealthChecksPageProps = {
    params: Promise<{ orgId: string }>;
    searchParams: Promise<Record<string, string>>;
};

export const dynamic = "force-dynamic";

function parsePositiveInt(s: string | undefined): number | undefined {
    if (!s) return undefined;
    const n = Number(s);
    if (!Number.isInteger(n) || n <= 0) return undefined;
    return n;
}

export default async function AlertingHealthChecksPage(
    props: AlertingHealthChecksPageProps
) {
    const params = await props.params;
    const searchParams = new URLSearchParams(await props.searchParams);

    const page = Math.max(1, parsePositiveInt(searchParams.get("page") ?? undefined) ?? 1);
    const pageSize = Math.max(
        1,
        parsePositiveInt(searchParams.get("pageSize") ?? undefined) ?? 20
    );
    const pageIndex = page - 1;
    const query = searchParams.get("query") ?? undefined;

    const apiSp = new URLSearchParams();
    apiSp.set("limit", String(pageSize));
    apiSp.set("offset", String(pageIndex * pageSize));
    if (query) apiSp.set("query", query);

    let healthChecks: ListHealthChecksResponse["healthChecks"] = [];
    let pagination: ListHealthChecksResponse["pagination"] = {
        total: 0,
        limit: pageSize,
        offset: pageIndex * pageSize
    };
    try {
        const res = await internal.get<AxiosResponse<ListHealthChecksResponse>>(
            `/org/${params.orgId}/health-checks?${apiSp.toString()}`,
            await authCookieHeader()
        );
        const responseData = res.data.data;
        healthChecks = responseData.healthChecks;
        pagination = responseData.pagination;
    } catch {
        // leave defaults
    }

    const t = await getTranslations();

    return (
        <div className="space-y-6">
            <DismissableBanner
                storageKey="alerting-health-checks-banner-dismissed"
                version={1}
                title={t("alertingHealthChecksBannerTitle")}
                titleIcon={
                    <HeartPulse className="w-5 h-5 text-primary shrink-0" />
                }
                description={t("alertingHealthChecksBannerDescription")}
            />
            <HealthChecksTable
                orgId={params.orgId}
                healthChecks={healthChecks}
                rowCount={pagination.total}
            />
        </div>
    );
}
