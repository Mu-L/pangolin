export type PolicyAccessRule = {
    ruleId: number;
    action: "ACCEPT" | "DROP" | "PASS";
    match: string;
    value: string;
    priority: number;
    enabled: boolean;
    new?: boolean;
    updated?: boolean;
    fromPolicy?: boolean;
};

export type EmptyRuleDraft = PolicyAccessRule & {
    new: true;
};

export function createEmptyRule(
    existingRules: Array<{ priority: number }>
): EmptyRuleDraft {
    const priority =
        existingRules.reduce(
            (acc, rule) => (rule.priority > acc ? rule.priority : acc),
            0
        ) + 1;

    return {
        ruleId: Date.now(),
        action: "ACCEPT",
        match: "PATH",
        value: "",
        priority,
        enabled: true,
        new: true
    };
}

export function sortPolicyRulesByPriority<T extends { priority: number }>(
    rules: T[]
): T[] {
    return [...rules].sort((a, b) => a.priority - b.priority);
}

export function reorderPolicyRules<
    T extends { priority: number; new?: boolean; updated?: boolean }
>(
    rules: T[],
    fromIndex: number,
    toIndex: number,
    options?: { markUpdated?: boolean }
): T[] {
    if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= rules.length ||
        toIndex >= rules.length
    ) {
        return rules;
    }

    const reordered = [...rules];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    return reordered.map((rule, index) => {
        const next = { ...rule, priority: index + 1 };
        if (options?.markUpdated && !rule.new) {
            return { ...next, updated: true };
        }
        return next;
    });
}
