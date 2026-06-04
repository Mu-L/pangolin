import { generateBrowserGatewayMetadata } from "@app/lib/browserGatewayMetadata";
import { getBrowserTargetForRequest } from "@app/lib/getBrowserTargetForRequest";
import RdpClient from "./RdpClient";
import AuthFooter from "@app/components/AuthFooter";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
    return generateBrowserGatewayMetadata("RDP");
}

export default async function RdpPage() {
    const { target } = await getBrowserTargetForRequest();
    const error = target ? null : "No resource found for this domain";

    return (
        <div className="h-full flex flex-col">
            <div className="flex-1 flex md:items-center justify-center">
                <div className="w-full max-w-md p-3">
                    <RdpClient target={target} error={error} />
                </div>
            </div>
            <AuthFooter />
        </div>
    );
}
