"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getInternalRedirectTarget } from "@app/lib/internalRedirect";

type RedirectToOrgProps = {
    targetOrgId: string;
};

export default function RedirectToOrg({ targetOrgId }: RedirectToOrgProps) {
    const router = useRouter();

    useEffect(() => {
        try {
            const target = getInternalRedirectTarget(targetOrgId);
            router.replace(target);
        } catch {
            router.replace(`/${targetOrgId}`);
        }
    }, [targetOrgId, router]);

    return null;
}
