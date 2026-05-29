import { headers } from "next/headers";
import { priv } from "@app/lib/api";
import { AxiosResponse } from "axios";
import { GetBrowserTargetResponse } from "@server/routers/browserGatewayTarget";
import VncClient from "./VncClient";
import AuthFooter from "@app/components/AuthFooter";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "VNC"
};

export default async function VncPage() {
    const headersList = await headers();
    const host = headersList.get("host") || "";
    const hostname = host.split(":")[0];

    let target: GetBrowserTargetResponse | null = null;
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

    return (
        <div className="h-full flex flex-col">
            <div className="flex-1 flex md:items-center justify-center">
                <div className="w-full max-w-md p-3">
                    <VncClient target={target} error={error} />
                </div>
            </div>
            <AuthFooter />
        </div>
    );
}
