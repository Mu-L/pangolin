import { redirect } from "next/navigation";

type ProvisioningPageProps = {
    params: Promise<{ orgId: string }>;
};

export default async function ProvisioningPage(props: ProvisioningPageProps) {
    const params = await props.params;
    redirect(`/${params.orgId}/settings/provisioning/keys`);
}