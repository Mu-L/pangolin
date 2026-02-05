"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { consumeInternalRedirectPath } from "@app/lib/internalRedirect";

type ApplyInternalRedirectProps = {
    orgId: string;
};

export default function ApplyInternalRedirect({
    orgId
}: ApplyInternalRedirectProps) {
    const router = useRouter();

    useEffect(() => {
        const path = consumeInternalRedirectPath();
        if (path) {
            router.replace(`/${orgId}${path}`);
        }
    }, [orgId, router]);

    return null;
}
