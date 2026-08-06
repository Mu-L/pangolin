const modelKeyRegexCache = new Map<string, RegExp>();

export function isModelKeyPattern(key: string): boolean {
    return key.includes("*") || key.includes("?");
}

function getModelKeyRegex(pattern: string): RegExp {
    let regex = modelKeyRegexCache.get(pattern);
    if (!regex) {
        const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
        regex = new RegExp(
            `^${escaped.replace(/\*/g, ".*").replace(/\?/g, ".")}$`
        );
        modelKeyRegexCache.set(pattern, regex);
    }
    return regex;
}

export function modelKeyMatches(
    pattern: string,
    requestedModel: string
): boolean {
    return getModelKeyRegex(pattern).test(requestedModel);
}

function wildcardCharCount(key: string): number {
    let count = 0;
    for (const char of key) {
        if (char === "*" || char === "?") {
            count += 1;
        }
    }
    return count;
}

function literalLength(key: string): number {
    return key.replace(/[*?]/g, "").length;
}

/**
 * Sort comparator: more specific patterns sort before less specific ones
 * (negative when `a` is more specific than `b`).
 *
 * 1. Exact keys beat patterns
 * 2. Fewer wildcard characters win
 * 3. Longer literal length wins
 */
export function compareModelKeySpecificity(a: string, b: string): number {
    const aIsPattern = isModelKeyPattern(a);
    const bIsPattern = isModelKeyPattern(b);

    if (aIsPattern !== bIsPattern) {
        return aIsPattern ? 1 : -1;
    }

    const wildcardDiff = wildcardCharCount(a) - wildcardCharCount(b);
    if (wildcardDiff !== 0) {
        return wildcardDiff;
    }

    return literalLength(b) - literalLength(a);
}

/**
 * Attach-time conflict check. Detects identical keys and exact-vs-pattern
 * matches. Does not attempt full glob intersection.
 */
export function modelKeysConflict(a: string, b: string): boolean {
    if (a === b) {
        return true;
    }

    const aIsPattern = isModelKeyPattern(a);
    const bIsPattern = isModelKeyPattern(b);

    if (aIsPattern === bIsPattern) {
        return false;
    }

    if (aIsPattern) {
        return modelKeyMatches(a, b);
    }

    return modelKeyMatches(b, a);
}
