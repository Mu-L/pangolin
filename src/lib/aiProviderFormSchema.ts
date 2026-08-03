import { z } from "zod";
import {
    AI_PROVIDER_DEFAULTS,
    providerRequiresUpstreamUrl,
    type AiProviderType
} from "@server/lib/aiProviderDefaults";

export const aiProviderTypeValues = [
    "openai",
    "anthropic",
    "googleGemini",
    "vertexAi",
    "bedrock",
    "microsoftFoundry",
    "openRouter",
    "vercelAiGateway",
    "custom"
] as const satisfies readonly AiProviderType[];

export const aiProviderFormSchema = z
    .object({
        name: z.string().trim().min(1),
        type: z.enum(aiProviderTypeValues),
        upstreamUrl: z.string().optional().nullable(),
        apiKey: z.string().optional(),
        authType: z.enum(["bearer"]).optional().nullable(),
        routingMode: z.enum(["url", "target"]).optional(),
        skipTlsVerification: z.boolean().optional(),
        budgetAmount: z.number().positive().nullable().optional(),
        budgetUnit: z.enum(["usd", "tokens"]).optional().nullable(),
        enabled: z.boolean().optional()
    })
    .superRefine((data, ctx) => {
        const routingMode =
            data.type === "custom" ? (data.routingMode ?? "url") : "url";

        if (data.type !== "custom" && data.routingMode === "target") {
            ctx.addIssue({
                code: "custom",
                message:
                    "routingMode target is only allowed for custom providers",
                path: ["routingMode"]
            });
        }

        const upstreamUrl =
            data.upstreamUrl && data.upstreamUrl.trim().length > 0
                ? data.upstreamUrl.trim()
                : null;

        if (upstreamUrl) {
            try {
                new URL(upstreamUrl);
            } catch {
                ctx.addIssue({
                    code: "custom",
                    message: "Invalid URL",
                    path: ["upstreamUrl"]
                });
            }
        }

        if (
            providerRequiresUpstreamUrl(data.type, routingMode) &&
            !upstreamUrl
        ) {
            ctx.addIssue({
                code: "custom",
                message: `upstreamUrl is required for ${data.type} providers`,
                path: ["upstreamUrl"]
            });
        }

        if (data.type === "custom" && !data.authType) {
            ctx.addIssue({
                code: "custom",
                message: "authType is required for custom providers",
                path: ["authType"]
            });
        }

        const hasAmount =
            data.budgetAmount !== undefined && data.budgetAmount !== null;
        const hasUnit =
            data.budgetUnit !== undefined && data.budgetUnit !== null;

        if (hasAmount !== hasUnit) {
            ctx.addIssue({
                code: "custom",
                message:
                    "budgetAmount and budgetUnit must both be set or both omitted",
                path: hasAmount ? ["budgetUnit"] : ["budgetAmount"]
            });
        }
    });

export type AiProviderFormValues = z.infer<typeof aiProviderFormSchema>;

export const aiProviderCreateFormSchema = aiProviderFormSchema.superRefine(
    (data, ctx) => {
        if (!data.apiKey?.trim()) {
            ctx.addIssue({
                code: "custom",
                message: "API key is required",
                path: ["apiKey"]
            });
        }
    }
);

export function emptyUpstreamForType(type: AiProviderType): string {
    if (type === "custom") {
        return "";
    }
    return AI_PROVIDER_DEFAULTS[type].upstreamUrl ?? "";
}

export function showsUpstreamUrlField(
    type: AiProviderType,
    routingMode: "url" | "target" | undefined
): boolean {
    const mode = type === "custom" ? (routingMode ?? "url") : "url";
    if (mode === "target") {
        return false;
    }
    return true;
}

export function upstreamUrlRequired(
    type: AiProviderType,
    routingMode: "url" | "target" | undefined
): boolean {
    const mode = type === "custom" ? (routingMode ?? "url") : "url";
    return providerRequiresUpstreamUrl(type, mode);
}

export function toAiProviderCreatePayload(values: AiProviderFormValues) {
    const routingMode =
        values.type === "custom" ? (values.routingMode ?? "url") : "url";
    const upstreamRaw = values.upstreamUrl?.trim() ?? "";
    const upstreamUrl =
        routingMode === "target"
            ? null
            : upstreamRaw.length > 0
              ? upstreamRaw
              : null;

    const hasBudget =
        values.budgetAmount !== undefined &&
        values.budgetAmount !== null &&
        values.budgetUnit;

    return {
        name: values.name.trim(),
        type: values.type,
        routingMode: values.type === "custom" ? routingMode : undefined,
        upstreamUrl,
        apiKey: values.apiKey?.trim() ? values.apiKey.trim() : undefined,
        authType:
            values.type === "custom"
                ? (values.authType ?? "bearer")
                : (values.authType ?? undefined),
        skipTlsVerification: values.skipTlsVerification,
        budgetAmount: hasBudget ? values.budgetAmount : null,
        budgetUnit: hasBudget ? values.budgetUnit : null,
        enabled: values.enabled ?? true
    };
}

export function toAiProviderUpdatePayload(values: AiProviderFormValues) {
    const routingMode =
        values.type === "custom" ? (values.routingMode ?? "url") : "url";
    const upstreamRaw = values.upstreamUrl?.trim() ?? "";
    const upstreamUrl =
        routingMode === "target"
            ? null
            : upstreamRaw.length > 0
              ? upstreamRaw
              : null;

    const hasBudget =
        values.budgetAmount !== undefined &&
        values.budgetAmount !== null &&
        values.budgetUnit;

    const payload: Record<string, unknown> = {
        name: values.name.trim(),
        routingMode: values.type === "custom" ? routingMode : "url",
        upstreamUrl,
        authType:
            values.type === "custom"
                ? (values.authType ?? "bearer")
                : (values.authType ?? null),
        skipTlsVerification: values.skipTlsVerification ?? false,
        budgetAmount: hasBudget ? values.budgetAmount : null,
        budgetUnit: hasBudget ? values.budgetUnit : null,
        enabled: values.enabled ?? true
    };

    if (values.apiKey?.trim()) {
        payload.apiKey = values.apiKey.trim();
    }

    return payload;
}

export function toAiProviderNetworkPayload(values: AiProviderFormValues) {
    const full = toAiProviderUpdatePayload(values);
    return {
        routingMode: full.routingMode,
        upstreamUrl: full.upstreamUrl,
        skipTlsVerification: full.skipTlsVerification
    };
}

export function toAiProviderAuthPayload(values: AiProviderFormValues) {
    const full = toAiProviderUpdatePayload(values);
    return {
        authType: full.authType,
        ...(values.apiKey !== undefined ? { apiKey: values.apiKey.trim() } : {})
    };
}

export function toAiProviderConfigurationPayload(values: AiProviderFormValues) {
    const {
        name: _name,
        enabled: _enabled,
        ...payload
    } = toAiProviderUpdatePayload(values);
    return payload;
}
