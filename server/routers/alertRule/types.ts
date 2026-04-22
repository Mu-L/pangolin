export type ListAlertRulesResponse = {
    alertRules: {
        alertRuleId: number;
        orgId: string;
        name: string;
        eventType: string;
        enabled: boolean;
        cooldownSeconds: number;
        lastTriggeredAt: number | null;
        createdAt: number;
        updatedAt: number;
        siteIds: number[];
        healthCheckIds: number[];
        resourceIds: number[];
    }[];
    pagination: {
        total: number;
        limit: number;
        offset: number;
    };
};
