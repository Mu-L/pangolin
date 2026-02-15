import { cleanRedirect } from "@app/lib/cleanRedirect";

export const INTERNAL_REDIRECT_KEY = "internal_redirect";

/**
 * Consumes the internal_redirect value from localStorage if present and valid
 * (within TTL). Removes it from storage. Returns the path segment (with leading
 * slash) to append to an orgId, or null if none/expired/invalid.
 */
export function consumeInternalRedirectPath(): string | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.localStorage.getItem(INTERNAL_REDIRECT_KEY);
        if (raw == null || raw === "") return null;

        window.localStorage.removeItem(INTERNAL_REDIRECT_KEY);

        const { path: storedPath, expiresAt } = JSON.parse(raw) as {
            path?: string;
            expiresAt?: number;
        };
        if (
            typeof storedPath !== "string" ||
            storedPath === "" ||
            typeof expiresAt !== "number" ||
            Date.now() > expiresAt
        ) {
            return null;
        }

        const cleaned = cleanRedirect(storedPath, {
            fallback: "",
            allowAllQueryParams: true
        });
        if (!cleaned) return null;

        return cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
    } catch {
        return null;
    }
}

/**
 * Returns the full redirect target if a valid internal_redirect was stored
 * (consumes the stored value). Returns null if none was stored or expired.
 * Paths starting with /auth/ are returned as-is; others are prefixed with orgId.
 */
export function getInternalRedirectTarget(orgId: string): string | null {
    const path = consumeInternalRedirectPath();
    if (!path) return null;
    return path.startsWith("/auth/") ? path : `/${orgId}${path}`;
}
