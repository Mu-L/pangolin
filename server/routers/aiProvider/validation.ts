import { z } from "zod";
import {
    providerRequiresUpstreamUrl,
    type AiProviderRoutingMode,
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

export const aiAuthTypeSchema = z.enum(["bearer"]);

export const aiRoutingModeSchema = z.enum(["url", "target"]);

export function refineProviderUpstreamFields(
    data: {
        type: AiProviderType;
        upstreamUrl?: string | null;
        authType?: "bearer" | null;
        routingMode?: AiProviderRoutingMode | null;
    },
    ctx: z.RefinementCtx
) {
    const routingMode = data.routingMode ?? "url";

    if (data.type !== "custom" && routingMode === "target") {
        ctx.addIssue({
            code: "custom",
            message: "routingMode target is only allowed for custom providers",
            path: ["routingMode"]
        });
    }

    if (
        providerRequiresUpstreamUrl(data.type, routingMode) &&
        !data.upstreamUrl
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
}
