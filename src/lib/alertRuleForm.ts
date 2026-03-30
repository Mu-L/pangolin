import type { Tag } from "@app/components/tags/tag-input";
import {
    type AlertRule,
    type AlertTrigger,
    isoNow,
    type AlertAction as StoredAlertAction
} from "@app/lib/alertRulesLocalStorage";
import { z } from "zod";

export const tagSchema = z.object({
    id: z.string(),
    text: z.string()
});

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
    targetIds: number[];
    trigger: AlertTrigger;
    actions: AlertRuleFormAction[];
};

export function buildFormSchema(t: (k: string) => string) {
    return z
        .object({
            name: z.string().min(1, { message: t("alertingErrorNameRequired") }),
            enabled: z.boolean(),
            sourceType: z.enum(["site", "health_check"]),
            siteIds: z.array(z.number()),
            targetIds: z.array(z.number()),
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
                val.targetIds.length === 0
            ) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: t("alertingErrorPickHealthChecks"),
                    path: ["targetIds"]
                });
            }
            const siteTriggers: AlertTrigger[] = [
                "site_online",
                "site_offline"
            ];
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
                        // eslint-disable-next-line no-new
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

export function defaultFormValues(): AlertRuleFormValues {
    return {
        name: "",
        enabled: true,
        sourceType: "site",
        siteIds: [],
        targetIds: [],
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

export function ruleToFormValues(rule: AlertRule): AlertRuleFormValues {
    const actions: AlertRuleFormAction[] = rule.actions.map(
        (a: StoredAlertAction) => {
            if (a.type === "notify") {
                return {
                    type: "notify",
                    userIds: a.userIds.map(String),
                    roleIds: [...a.roleIds],
                    emailTags: a.emails.map((e) => ({ id: e, text: e }))
                };
            }
            if (a.type === "sms") {
                return {
                    type: "sms",
                    phoneTags: a.phoneNumbers.map((p) => ({ id: p, text: p }))
                };
            }
            return {
                type: "webhook",
                url: a.url,
                method: a.method,
                headers:
                    a.headers.length > 0
                        ? a.headers.map((h) => ({ ...h }))
                        : [{ key: "", value: "" }],
                secret: a.secret ?? ""
            };
        }
    );
    return {
        name: rule.name,
        enabled: rule.enabled,
        sourceType: rule.source.type,
        siteIds:
            rule.source.type === "site" ? [...rule.source.siteIds] : [],
        targetIds:
            rule.source.type === "health_check"
                ? [...rule.source.targetIds]
                : [],
        trigger: rule.trigger,
        actions
    };
}

export function formValuesToRule(
    v: AlertRuleFormValues,
    id: string,
    createdAt: string
): AlertRule {
    const source =
        v.sourceType === "site"
            ? { type: "site" as const, siteIds: v.siteIds }
            : {
                  type: "health_check" as const,
                  targetIds: v.targetIds
              };
    const actions = v.actions.map((a) => {
        if (a.type === "notify") {
            return {
                type: "notify" as const,
                userIds: a.userIds,
                roleIds: a.roleIds,
                emails: a.emailTags.map((tg) => tg.text.trim()).filter(Boolean)
            };
        }
        if (a.type === "sms") {
            return {
                type: "sms" as const,
                phoneNumbers: a.phoneTags
                    .map((tg) => tg.text.trim())
                    .filter(Boolean)
            };
        }
        return {
            type: "webhook" as const,
            url: a.url.trim(),
            method: a.method,
            headers: a.headers.filter((h) => h.key.trim() || h.value.trim()),
            secret: a.secret.trim() || undefined
        };
    });
    return {
        id,
        name: v.name.trim(),
        enabled: v.enabled,
        createdAt,
        updatedAt: isoNow(),
        source,
        trigger: v.trigger,
        actions
    };
}
