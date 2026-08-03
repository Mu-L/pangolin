import { redirect } from "next/navigation";

type Props = {
    params: Promise<{ orgId: string; providerId: string }>;
};

export default async function AiProviderPage({ params }: Props) {
    const { orgId, providerId } = await params;
    redirect(`/${orgId}/settings/ai-providers/${providerId}/general`);
}
