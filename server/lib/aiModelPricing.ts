import fs from "node:fs";
import path from "node:path";
import { APP_PATH } from "@server/lib/consts";
import type { AiProviderType } from "@server/lib/aiProviderDefaults";
import type { AiUsage } from "@server/lib/aiUsageExtraction";
import logger from "@server/logger";

// config/models.json is a runtime asset (same category as config.yml or the
// MaxMind DBs) - not part of the source tree. Its shape mirrors litellm's
// public model_prices_and_context_window.json: a flat list of
// { id, name, provider, input_cost_per_token, output_cost_per_token,
// cache_read_input_token_cost, output_cost_per_reasoning_token }, where
// `provider` is litellm's provider bucket, not our AiProviderType.
const MODELS_JSON_PATH = path.join(APP_PATH, "models.json");

export type AiModelPricingEntry = {
    id: string;
    name: string;
    provider: string;
    input_cost_per_token: number | null;
    output_cost_per_token: number | null;
    cache_read_input_token_cost: number | null;
    output_cost_per_reasoning_token: number | null;
};

export type AiModelPricing = {
    inputCostPerToken: number | null;
    outputCostPerToken: number | null;
    cacheReadInputTokenCost: number | null;
    outputCostPerReasoningToken: number | null;
    // True when the match came from a different provider bucket than the one
    // mapped to this provider's type (e.g. an openRouter/custom model id that
    // only matched by stripping a "vendor/" prefix against the whole table).
    // Costs found this way are a best-effort approximation, not a guarantee
    // the upstream provider bills at the same rate.
    approximate: boolean;
};

// Which litellm provider buckets to search for each of our provider types.
// Several of our provider types (openRouter, vercelAiGateway, custom) proxy
// arbitrary underlying models and have no dedicated bucket in the pricing
// data, so they fall back to a global search across all buckets.
const PROVIDER_PRICING_BUCKETS: Record<
    Exclude<AiProviderType, "custom">,
    string[]
> = {
    openai: ["openai"],
    anthropic: ["anthropic"],
    googleGemini: ["gemini"],
    vertexAi: [
        "vertex_ai-language-models",
        "vertex_ai",
        "vertex_ai-anthropic_models",
        "vertex_ai-mistral_models",
        "vertex_ai-deepseek_models",
        "vertex_ai-ai21_models",
        "vertex_ai-llama_models",
        "vertex_ai-minimax_models",
        "vertex_ai-moonshot_models",
        "vertex_ai-zai_models",
        "vertex_ai-openai_models",
        "vertex_ai-qwen_models",
        "vertex_ai-text-models"
    ],
    bedrock: ["bedrock_converse", "bedrock", "bedrock_mantle"],
    microsoftFoundry: ["azure", "azure_ai", "azure_text"],
    openRouter: [],
    vercelAiGateway: []
};

let modelsById: Map<string, AiModelPricingEntry[]> | null = null;

function loadModels(): Map<string, AiModelPricingEntry[]> {
    if (modelsById) {
        return modelsById;
    }

    const byId = new Map<string, AiModelPricingEntry[]>();
    try {
        if (fs.existsSync(MODELS_JSON_PATH)) {
            const raw = fs.readFileSync(MODELS_JSON_PATH, "utf-8");
            const parsed = JSON.parse(raw) as { data: AiModelPricingEntry[] };
            for (const entry of parsed.data ?? []) {
                for (const key of [entry.id, entry.name]) {
                    if (!key) continue;
                    const list = byId.get(key) ?? [];
                    list.push(entry);
                    byId.set(key, list);
                }
            }
        } else {
            logger.debug(
                `AI model pricing file not found at ${MODELS_JSON_PATH}; cost calculation will fall back to unknown pricing`
            );
        }
    } catch (error) {
        logger.warn("Failed to load AI model pricing file", { error });
    }

    modelsById = byId;
    return byId;
}

function stripVendorPrefix(modelId: string): string | null {
    const idx = modelId.indexOf("/");
    if (idx === -1 || idx === modelId.length - 1) {
        return null;
    }
    return modelId.slice(idx + 1);
}

function toPricing(
    entry: AiModelPricingEntry,
    approximate: boolean
): AiModelPricing {
    return {
        inputCostPerToken: entry.input_cost_per_token,
        outputCostPerToken: entry.output_cost_per_token,
        cacheReadInputTokenCost: entry.cache_read_input_token_cost,
        outputCostPerReasoningToken: entry.output_cost_per_reasoning_token,
        approximate
    };
}

function findInBuckets(
    byId: Map<string, AiModelPricingEntry[]>,
    modelId: string,
    buckets: string[] | null
): AiModelPricingEntry | null {
    const candidates = [modelId, stripVendorPrefix(modelId)].filter(
        (v): v is string => v != null
    );

    for (const key of candidates) {
        const entries = byId.get(key);
        if (!entries) continue;
        const match = buckets
            ? entries.find((e) => buckets.includes(e.provider))
            : entries[0];
        if (match) {
            return match;
        }
    }
    return null;
}

/**
 * Looks up per-token pricing for a model, scoped first to the litellm
 * provider bucket(s) that correspond to our provider type, then falling
 * back to a global search across all buckets (marked `approximate`) for
 * provider types that proxy arbitrary underlying models.
 */
export function getModelPricing(
    providerType: AiProviderType,
    modelId: string | undefined
): AiModelPricing | null {
    if (!modelId) {
        return null;
    }

    const byId = loadModels();
    const buckets =
        providerType === "custom"
            ? []
            : PROVIDER_PRICING_BUCKETS[providerType];

    if (buckets && buckets.length > 0) {
        const scoped = findInBuckets(byId, modelId, buckets);
        if (scoped) {
            return toPricing(scoped, false);
        }
    }

    const fallback = findInBuckets(byId, modelId, null);
    if (fallback) {
        return toPricing(fallback, true);
    }

    return null;
}

export type AiCostBreakdown = {
    promptCost: number;
    cacheReadCost: number;
    cacheWriteCost: number;
    completionCost: number;
    reasoningCost: number;
    totalCost: number;
};

/**
 * Computes a $ cost breakdown for a usage record given a model's pricing.
 * Cache writes and reasoning tokens fall back to the normal input/output
 * rate respectively when the pricing data has no dedicated rate for them
 * (the models.json schema here has no cache-write field at all, and only
 * some models report a distinct reasoning rate).
 */
export function calculateAiCost(
    pricing: AiModelPricing | null,
    usage: AiUsage
): AiCostBreakdown | null {
    if (!pricing) {
        return null;
    }

    const inputRate = pricing.inputCostPerToken ?? 0;
    const outputRate = pricing.outputCostPerToken ?? 0;
    const cacheReadRate = pricing.cacheReadInputTokenCost ?? inputRate;
    const reasoningRate = pricing.outputCostPerReasoningToken ?? outputRate;

    const promptCost = usage.promptTokens * inputRate;
    const cacheReadCost = usage.cacheReadTokens * cacheReadRate;
    const cacheWriteCost = usage.cacheWriteTokens * inputRate;
    const completionCost = usage.completionTokens * outputRate;
    const reasoningCost = usage.reasoningTokens * reasoningRate;

    return {
        promptCost,
        cacheReadCost,
        cacheWriteCost,
        completionCost,
        reasoningCost,
        totalCost:
            promptCost +
            cacheReadCost +
            cacheWriteCost +
            completionCost +
            reasoningCost
    };
}
