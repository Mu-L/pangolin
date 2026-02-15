"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getInternalRedirectTarget } from "@app/lib/internalRedirect";

type ApplyInternalRedirectProps = {
    orgId: string;
};

export default function ApplyInternalRedirect({
    orgId
}: ApplyInternalRedirectProps) {
    const router = useRouter();

    useEffect(() => {
        const target = getInternalRedirectTarget(orgId);
        if (target) {
            router.replace(target);
        }
    }, [orgId, router]);

    return null;
}
