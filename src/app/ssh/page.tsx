import SshClient from "./SshClient";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "SSH Terminal"
};

export default function SshPage() {
    return <SshClient />;
}
