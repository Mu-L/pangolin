import { headers } from "next/headers";
import { priv } from "@app/lib/api";
import { AxiosResponse } from "axios";
import { GetBrowserTargetResponse } from "@server/routers/resource";
import SshClient from "./SshClient";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "SSH"
};

export default async function SshPage() {
    const headersList = await headers();
    const host = headersList.get("host") || "";
    const hostname = host.split(":")[0];

    let target: { ip: string; port: number } | null = null;
    let error: string | null = null;

    try {
        const res = await priv.get<AxiosResponse<GetBrowserTargetResponse>>(
            `/resource/browser-target?fullDomain=${encodeURIComponent(hostname)}`
        );
        target = res.data.data;
    } catch (error) {
        console.error("Error fetching browser target:", error);
        error = "No resource found for this domain";
    }

    return <SshClient target={target} error={error} />;
}
