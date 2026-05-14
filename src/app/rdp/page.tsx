import { headers } from "next/headers";
import { internal } from "@app/lib/api";
import { AxiosResponse } from "axios";
import { GetBrowserTargetResponse } from "@server/routers/resource";
import RdpClient from "./RdpClient";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "RDP Test"
};

export default async function RdpPage() {
    const headersList = await headers();
    const host = headersList.get("host") || "";
    const hostname = host.split(":")[0];

    let target: { ip: string; port: number } | null = null;
    let error: string | null = null;

    try {
        const res = await internal.get<AxiosResponse<GetBrowserTargetResponse>>(
            `/resource/browser-target?fullDomain=${encodeURIComponent(hostname)}`
        );
        target = res.data.data;
    } catch {
        error = "No resource found for this domain";
    }

    return <RdpClient target={target} error={error} />;
}
