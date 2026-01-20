import { redirect } from "next/navigation";

export default async function ClientPage(props: {
    params: Promise<{ orgId: string; niceId: number | string }>;
}) {
    const params = await props.params;
    redirect(
        `/${params.orgId}/settings/clients/user/${params.niceId}/general`
    );
}
