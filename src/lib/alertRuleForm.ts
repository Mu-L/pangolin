import type { Tag } from "@app/components/tags/tag-input";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared primitive schemas
// ---------------------------------------------------------------------------

export const tagSchema = z.object({
    id: z.string(),
    text: z.string()
});

// ---------------------------------------------------------------------------
// Form-layer types
// NOTE: the form uses "health_check_unhealthy" internally; it maps to the
//       backend's "health_check_not_healthy" at the API boundary.
// ---------------------------------------------------------------------------

export type AlertTrigger =
    | "site_online"
    | "site_offline"
    | "health_check_healthy"
    | "health_check_unhealthy";

export type AlertRuleFormAction =
    | {
          type: "notify";
          userIds: string[];
          roleIds: number[];
          emailTags: Tag[];
      }
    | { type: "sms"; phoneTags: Tag[] }
    | {
          type: "webhook";
          url: string;
          method: string;
          headers: { key: string; value: string }[];
          secret: string;
      };

export type AlertRuleFormValues = {
    name: string;
    enabled: boolean;
    sourceType: "site" | "health_check";
    siteIds: number[];
    healthCheckIds: number[];
    trigger: AlertTrigger;
    actions: AlertRuleFormAction[];
};

// ---------------------------------------------------------------------------
// API boundary types
// ---------------------------------------------------------------------------

export type AlertRuleApiPayload = {
    name: string;
    eventType:
        | "site_online"
        | "site_offline"
        | "health_check_healthy"
        | "health_check_not_healthy";
    enabled: boolean;
    siteIds: number[];
    healthCheckIds: number[];
    userIds: string[];
    roleIds: string[];
    emails: string[];
    webhookActions: {
        webhookUrl: string;
        enabled: boolean;
        config?: string;
    }[];
};

// Shape of what GET /org/:orgId/alert-rule/:alertRuleId returns
export type AlertRuleApiResponse = {
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
    recipients: {
        recipientId: number;
        userId: string | null;
        roleId: string | null;
        email: string | null;
    }[];
    webhookActions: {
        webhookActionId: number;
        webhookUrl: string;
        enabled: boolean;
        lastSentAt: number | null;
    }[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function triggerToEventType(
    trigger: AlertTrigger
): AlertRuleApiPayload["eventType"] {
    if (trigger === "health_check_unhealthy") {
        return "health_check_not_healthy";
    }
    return trigger as AlertRuleApiPayload["eventType"];
}

function eventTypeToTrigger(eventType: string): AlertTrigger {
    if (eventType === "health_check_not_healthy") {
        return "health_check_unhealthy";
    }
    return eventType as AlertTrigger;
}

// ---------------------------------------------------------------------------
// Zod form schema (for react-hook-form validation)
// ---------------------------------------------------------------------------

export function buildFormSchema(t: (k: string) => string) {
    return z
        .object({
            name: z.string().min(1, { message: t("alertingErrorNameRequired") }),
            enabled: z.boolean(),
            sourceType: z.enum(["site", "health_check"]),
            siteIds: z.array(z.number()),
            healthCheckIds: z.array(z.number()),
            trigger: z.enum([
                "site_online",
                "site_offline",
                "health_check_healthy",
                "health_check_unhealthy"
            ]),
            actions: z
                .array(
                    z.discriminatedUnion("type", [
                        z.object({
                            type: z.literal("notify"),
                            userIds: z.array(z.string()),
                            roleIds: z.array(z.number()),
                            emailTags: z.array(tagSchema)
                        }),
                        z.object({
                            type: z.literal("sms"),
                            phoneTags: z.array(tagSchema)
                        }),
                        z.object({
                            type: z.literal("webhook"),
                            url: z.string(),
                            method: z.string(),
                            headers: z.array(
                                z.object({
                                    key: z.string(),
                                    value: z.string()
                                })
                            ),
                            secret: z.string()
                        })
                    ])
                )
        })
        .superRefine((val, ctx) => {
            if (val.actions.length === 0) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: t("alertingErrorActionsMin"),
                    path: ["actions"]
                });
            }
            if (val.sourceType === "site" && val.siteIds.length === 0) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: t("alertingErrorPickSites"),
                    path: ["siteIds"]
                });
            }
            if (
                val.sourceType === "health_check" &&
                val.healthCheckIds.length === 0
            ) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: t("alertingErrorPickHealthChecks"),
                    path: ["healthCheckIds"]
                });
            }
            const siteTriggers: AlertTrigger[] = ["site_online", "site_offline"];
            const hcTriggers: AlertTrigger[] = [
                "health_check_healthy",
                "health_check_unhealthy"
            ];
            if (
                val.sourceType === "site" &&
                !siteTriggers.includes(val.trigger)
            ) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: t("alertingErrorTriggerSite"),
                    path: ["trigger"]
                });
            }
            if (
                val.sourceType === "health_check" &&
                !hcTriggers.includes(val.trigger)
            ) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: t("alertingErrorTriggerHealth"),
                    path: ["trigger"]
                });
            }
            val.actions.forEach((a, i) => {
                if (a.type === "notify") {
                    if (
                        a.userIds.length === 0 &&
                        a.roleIds.length === 0 &&
                        a.emailTags.length === 0
                    ) {
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            message: t("alertingErrorNotifyRecipients"),
                            path: ["actions", i, "userIds"]
                        });
                    }
                }
                if (a.type === "sms" && a.phoneTags.length === 0) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: t("alertingErrorSmsPhones"),
                        path: ["actions", i, "phoneTags"]
                    });
                }
                if (a.type === "webhook") {
                    try {
                        new URL(a.url.trim());
                    } catch {
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            message: t("alertingErrorWebhookUrl"),
                            path: ["actions", i, "url"]
                        });
                    }
                }
            });
        });
}

// ---------------------------------------------------------------------------
// defaultFormValues
// ---------------------------------------------------------------------------

export function defaultFormValues(): AlertRuleFormValues {
    return {
        name: "",
        enabled: true,
        sourceType: "site",
        siteIds: [],
        healthCheckIds: [],
        trigger: "site_offline",
        actions: [
            {
                type: "notify",
                userIds: [],
                roleIds: [],
                emailTags: []
            }
        ]
    };
}

// ---------------------------------------------------------------------------
// API response → form values
// ---------------------------------------------------------------------------

export function apiResponseToFormValues(
    rule: AlertRuleApiResponse
): AlertRuleFormValues {
    const trigger = eventTypeToTrigger(rule.eventType);
    const sourceType = rule.eventType.startsWith("site_")
        ? "site"
        : "health_check";

    // Collect notify recipients into a single notify action (if any)
    const userIds = rule.recipients
        .filter((r) => r.userId != null)
        .map((r) => r.userId!);
    const roleIds = rule.recipients
        .filter((r) => r.roleId != null)
        .map((r) => parseInt(r.roleId!, 10))
        .filter((n) => !isNaN(n));
    const emailTags = rule.recipients
        .filter((r) => r.email != null)
        .map((r) => ({ id: r.email!, text: r.email! }));

    const actions: AlertRuleFormAction[] = [];

    if (userIds.length > 0 || roleIds.length > 0 || emailTags.length > 0) {
        actions.push({ type: "notify", userIds, roleIds, emailTags });
    }

    // Each webhook action becomes its own form webhook action
    for (const w of rule.webhookActions) {
        actions.push({
            type: "webhook",
            url: w.webhookUrl,
            method: "POST",
            headers: [{ key: "", value: "" }],
            secret: ""
        });
    }

    // Always ensure at least one action so the form is valid
    if (actions.length === 0) {
        actions.push({
            type: "notify",
            userIds: [],
            roleIds: [],
            emailTags: []
        });
    }

    return {
        name: rule.name,
        enabled: rule.enabled,
        sourceType,
        siteIds: rule.siteIds,
        healthCheckIds: rule.healthCheckIds,
        trigger,
        actions
    };
}

// ---------------------------------------------------------------------------
// Form values → API payload
// ---------------------------------------------------------------------------

export function formValuesToApiPayload(
    values: AlertRuleFormValues
): AlertRuleApiPayload {
    const eventType = triggerToEventType(values.trigger);

    // Collect all notify-type actions and merge their recipient lists
    const allUserIds: string[] = [];
    const allRoleIds: string[] = [];
    const allEmails: string[] = [];

    const webhookActions: AlertRuleApiPayload["webhookActions"] = [];

    for (const action of values.actions) {
        if (action.type === "notify") {
            allUserIds.push(...action.userIds);
            allRoleIds.push(...action.roleIds.map(String));
            allEmails.push(
                ...action.emailTags
                    .map((t) => t.text.trim())
                    .filter(Boolean)
            );
        } else if (action.type === "webhook") {
            webhookActions.push({
                webhookUrl: action.url.trim(),
                enabled: true,
                // Encode any headers / secret as config JSON if present
                ...(action.secret.trim() ||
                action.headers.some((h) => h.key.trim())
                    ? {
                          config: JSON.stringify({
                              secret: action.secret.trim() || undefined,
                              headers: action.headers.filter(
                                  (h) => h.key.trim()
                              )
                          })
                      }
                    : {})
            });
        }
        // sms is not supported by the backend; silently skip
    }

    // Deduplicate
    const uniqueUserIds = [...new Set(allUserIds)];
    const uniqueRoleIds = [...new Set(allRoleIds)];
    const uniqueEmails = [...new Set(allEmails)];

    return {
        name: values.name.trim(),
        eventType,
        enabled: values.enabled,
        siteIds: values.siteIds,
        healthCheckIds: values.healthCheckIds,
        userIds: uniqueUserIds,
        roleIds: uniqueRoleIds,
        emails: uniqueEmails,
        webhookActions
    };
}