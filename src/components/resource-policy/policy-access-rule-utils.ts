export type EmptyRuleDraft = {
    ruleId: number;
    action: "ACCEPT" | "DROP" | "PASS";
    match: string;
    value: string;
    priority: number;
    enabled: boolean;
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
