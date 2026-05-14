import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Enterprise Licenses"
};

type Props = {
    params: Promise<{ orgId: string }>;
    searchParams: Promise<Record<string, string>>;
};

export const dynamic = "force-dynamic";

export default async function LabelsPage({ params, searchParams }: Props) {
    const { orgId } = await params;

    const sp = await searchParams;

    return <></>;
}
