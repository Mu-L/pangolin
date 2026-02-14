"use client";

import { useEffect } from "react";
import { INTERNAL_REDIRECT_KEY } from "@app/lib/internalRedirect";

const TTL_MS = 10 * 60 * 1000; // 10 minutes

export default function StoreInternalRedirect() {
    useEffect(() => {
        if (typeof window === "undefined") return;
        const params = new URLSearchParams(window.location.search);
        const value = params.get("internal_redirect");
        if (value != null && value !== "") {
            try {
                const payload = JSON.stringify({
                    path: value,
                    expiresAt: Date.now() + TTL_MS
                });
                window.localStorage.setItem(INTERNAL_REDIRECT_KEY, payload);
            } catch {
                // ignore
            }
        }
    }, []);

    return null;
}
