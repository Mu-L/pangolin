type CleanRedirectOptions = {
    fallback?: string;
    maxRedirectDepth?: number;
};

const ALLOWED_QUERY_PARAMS = new Set([
    "forceLogin",
    "code",
    "token",
    "redirect"
]);

const DUMMY_BASE = "https://internal.local";

export function cleanRedirect(
    input: string,
    options: CleanRedirectOptions = {}
): string {
    const { fallback = "/", maxRedirectDepth = 2 } = options;

    if (!input || typeof input !== "string") {
        return fallback;
    }

    try {
        return sanitizeUrl(input, fallback, maxRedirectDepth);
    } catch {
        return fallback;
    }
}

function sanitizeUrl(
    input: string,
    fallback: string,
    remainingRedirectDepth: number
): string {
    if (
        input.startsWith("javascript:") ||
        input.startsWith("data:") ||
        input.startsWith("//")
    ) {
        return fallback;
    }

    const url = new URL(input, DUMMY_BASE);

    // Must be a relative/internal path
    if (url.origin !== DUMMY_BASE) {
        return fallback;
    }

    if (!url.pathname.startsWith("/")) {
        return fallback;
    }

    const cleanParams = new URLSearchParams();

    for (const [key, value] of url.searchParams.entries()) {
        if (!ALLOWED_QUERY_PARAMS.has(key)) {
            continue;
        }

        if (key === "redirect") {
            if (remainingRedirectDepth <= 0) {
                continue;
            }

            const cleanedRedirect = sanitizeUrl(
                value,
                "",
                remainingRedirectDepth - 1
            );

            if (cleanedRedirect) {
                cleanParams.set("redirect", cleanedRedirect);
            }

            continue;
        }

        cleanParams.set(key, value);
    }

    const queryString = cleanParams.toString();
    return queryString ? `${url.pathname}?${queryString}` : url.pathname;
}
