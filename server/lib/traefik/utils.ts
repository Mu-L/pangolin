import logger from "@server/logger";

export function sanitize(input: string | null | undefined): string | undefined {
    if (!input) return undefined;
    // clean any non alphanumeric characters from the input and replace with dashes
    // the input cant be too long either, so limit to 50 characters
    if (input.length > 50) {
        input = input.substring(0, 50);
    }
    return input
        .replace(/[^a-zA-Z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}

/**
 * Encode a URL path into a collision-free alphanumeric string suitable for use
 * in Traefik map keys.
 *
 * Unlike sanitize(), this preserves uniqueness by encoding each non-alphanumeric
 * character as its hex code. Different paths always produce different outputs.
 *
 *   encodePath("/api")  => "2fapi"
 *   encodePath("/a/b")  => "2fa2fb"
 *   encodePath("/a-b")  => "2fa2db"   (different from /a/b)
 *   encodePath("/")     => "2f"
 *   encodePath(null)    => ""
 */
export function encodePath(path: string | null | undefined): string {
    if (!path) return "";
    return path.replace(/[^a-zA-Z0-9]/g, (ch) => {
        return ch.charCodeAt(0).toString(16);
    });
}

export function validatePathRewriteConfig(
    path: string | null,
    pathMatchType: string | null,
    rewritePath: string | null,
    rewritePathType: string | null
): { isValid: boolean; error?: string } {
    // If no path matching is configured, no rewriting is possible
    if (!path || !pathMatchType) {
        if (rewritePath || rewritePathType) {
            return {
                isValid: false,
                error: "Path rewriting requires path matching to be configured"
            };
        }
        return { isValid: true };
    }

    if (rewritePathType !== "stripPrefix") {
        if (
            (rewritePath && !rewritePathType) ||
            (!rewritePath && rewritePathType)
        ) {
            return {
                isValid: false,
                error: "Both rewritePath and rewritePathType must be specified together"
            };
        }
    }

    if (!rewritePath || !rewritePathType) {
        return { isValid: true };
    }

    const validPathMatchTypes = ["exact", "prefix", "regex"];
    if (!validPathMatchTypes.includes(pathMatchType)) {
        return {
            isValid: false,
            error: `Invalid pathMatchType: ${pathMatchType}. Must be one of: ${validPathMatchTypes.join(", ")}`
        };
    }

    const validRewritePathTypes = ["exact", "prefix", "regex", "stripPrefix"];
    if (!validRewritePathTypes.includes(rewritePathType)) {
        return {
            isValid: false,
            error: `Invalid rewritePathType: ${rewritePathType}. Must be one of: ${validRewritePathTypes.join(", ")}`
        };
    }

    if (pathMatchType === "regex") {
        try {
            new RegExp(path);
        } catch (e) {
            return {
                isValid: false,
                error: `Invalid regex pattern in path: ${path}`
            };
        }
    }

    // Additional validation for stripPrefix
    if (rewritePathType === "stripPrefix") {
        if (pathMatchType !== "prefix") {
            logger.warn(
                `stripPrefix rewrite type is most effective with prefix path matching. Current match type: ${pathMatchType}`
            );
        }
    }

    return { isValid: true };
}
