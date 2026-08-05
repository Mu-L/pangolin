import { z } from "zod";
import {
    AI_PROVIDER_AUTH_TYPES,
    providerRequiresUpstreamUrl,
    type AiProviderAuthType,
    type AiProviderRoutingMode,
    type AiProviderType
} from "@server/lib/aiProviderDefaults";
import { AI_CAPABILITIES } from "@server/lib/aiCapabilities";

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

export const aiAuthTypeSchema = z.enum(AI_PROVIDER_AUTH_TYPES);

export const aiRoutingModeSchema = z.enum(["url", "target"]);

export const aiCapabilitySchema = z.enum(AI_CAPABILITIES);

export const aiCapabilitiesSchema = z.array(aiCapabilitySchema);

export function refineProviderUpstreamFields(
    data: {
        type: AiProviderType;
        upstreamUrl?: string | null;
        authType?: AiProviderAuthType | null;
        routingMode?: AiProviderRoutingMode | null;
        capabilities?: z.infer<typeof aiCapabilitiesSchema> | null;
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

    if (data.type === "custom") {
        const caps = data.capabilities;
        if (!caps || caps.length === 0) {
            ctx.addIssue({
                code: "custom",
                message:
                    "At least one capability is required for custom providers",
                path: ["capabilities"]
            });
        }
    }
}
