import { headers } from "next/headers";
import { internal } from "@app/lib/api";
import { AxiosResponse } from "axios";
import { GetBrowserTargetResponse } from "@server/routers/resource";
import VncClient from "./VncClient";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "VNC Test"
};

export default async function VncPage() {
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

    return <VncClient target={target} error={error} />;
}
