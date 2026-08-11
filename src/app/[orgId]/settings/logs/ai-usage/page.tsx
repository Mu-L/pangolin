import { AiUsageAnalyticsData } from "@app/components/AiUsageAnalyticsData";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "AI Usage Analytics"
};

export interface AiUsageAnalyticsPageProps {
    params: Promise<{ orgId: string }>;
}

export default async function AiUsageAnalyticsPage(
    props: AiUsageAnalyticsPageProps
) {
    const orgId = (await props.params).orgId;

    return (
        <>
            <SettingsSectionTitle
                title="AI Usage Analytics"
                description="Analyze AI gateway cost, token usage, and activity across providers, resources, roles, and users"
            />

            <div className="container mx-auto max-w-12xl">
                <AiUsageAnalyticsData orgId={orgId} />
            </div>
        </>
    );
}
