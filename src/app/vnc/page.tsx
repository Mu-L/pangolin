import VncClient from "./VncClient";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "VNC Test"
};

export default function VncPage() {
    return <VncClient />;
}
