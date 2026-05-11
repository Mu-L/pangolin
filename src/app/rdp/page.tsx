import RdpClient from "./RdpClient";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "RDP Test"
};

export default function RdpPage() {
    return <RdpClient />;
}
