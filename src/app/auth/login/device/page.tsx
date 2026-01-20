import { verifySession } from "@app/lib/auth/verifySession";
import { redirect } from "next/navigation";
import DeviceLoginForm from "@/components/DeviceLoginForm";
import { getUserDisplayName } from "@app/lib/getUserDisplayName";
import { cache } from "react";

export const dynamic = "force-dynamic";

type Props = {
    searchParams: Promise<{ code?: string }>;
};

export default async function DeviceLoginPage({ searchParams }: Props) {
    const user = await verifySession({ forceLogin: true });

    const params = await searchParams;
    const code = params.code || "";

    if (!user) {
        const redirectDestination = code
            ? `/auth/login/device?code=${encodeURIComponent(code)}`
            : "/auth/login/device";
        redirect(
            `/auth/login?forceLogin=true&redirect=${encodeURIComponent(redirectDestination)}`
        );
    }

    const userName = user
        ? getUserDisplayName({
              name: user.name,
              username: user.username
          })
        : "";

    return (
        <DeviceLoginForm
            userEmail={user?.email || ""}
            userName={userName}
            initialCode={code}
        />
    );
}
