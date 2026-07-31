import { z } from "zod";
import {
    providerRequiresUpstreamUrl,
    type AiBudgetUnit,
    type AiProviderType
} from "@server/lib/aiProviderDefaults";

export const aiProviderTypeSchema = z.enum([
    "openai",
    "anthropic",
    "googleGemini",
    "vertexAi",
    "bedrock",
    "microsoftFoundry",
    "openRouter",
    "vercelAiGateway",
    "custom"
]);

export const aiBudgetUnitSchema = z.enum(["usd", "tokens"]);

export const aiAuthTypeSchema = z.enum(["bearer"]);

export function refineBudgetFields(
    data: {
        budgetAmount?: number | null;
        budgetUnit?: AiBudgetUnit | null;
    },
    ctx: z.RefinementCtx
) {
    const hasAmount =
        data.budgetAmount !== undefined && data.budgetAmount !== null;
    const hasUnit = data.budgetUnit !== undefined && data.budgetUnit !== null;

    if (hasAmount !== hasUnit) {
        ctx.addIssue({
            code: "custom",
            message:
                "budgetAmount and budgetUnit must both be set or both omitted",
            path: hasAmount ? ["budgetUnit"] : ["budgetAmount"]
        });
    }
}

export function refineProviderUpstreamFields(
    data: {
        type: AiProviderType;
        upstreamUrl?: string | null;
        authType?: "bearer" | null;
    },
    ctx: z.RefinementCtx
) {
    if (providerRequiresUpstreamUrl(data.type) && !data.upstreamUrl) {
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
}
