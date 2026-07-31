import { z } from "zod";
import type {
    AiBudgetUnit,
    AiProviderType
} from "@server/lib/aiProviderDefaults";

export const aiProviderTypeSchema = z.enum([
    "openai",
    "anthropic",
    "bedrock",
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

export function refineCustomProviderFields(
    data: {
        type: AiProviderType;
        upstreamUrl?: string | null;
        authType?: "bearer" | null;
    },
    ctx: z.RefinementCtx
) {
    if (data.type !== "custom") {
        return;
    }

    if (!data.upstreamUrl) {
        ctx.addIssue({
            code: "custom",
            message: "upstreamUrl is required for custom providers",
            path: ["upstreamUrl"]
        });
    }

    if (!data.authType) {
        ctx.addIssue({
            code: "custom",
            message: "authType is required for custom providers",
            path: ["authType"]
        });
    }
}
