import { getTranslations } from "next-intl/server";

export interface ResourcePoliciesPageProps {
    params: Promise<{ orgId: string }>;
    searchParams: Promise<{ view?: string }>;
}

export default async function ResourcePoliciesPage(
    props: ResourcePoliciesPageProps
) {
    const params = await props.params;
    const t = await getTranslations();
    return <></>;
}
