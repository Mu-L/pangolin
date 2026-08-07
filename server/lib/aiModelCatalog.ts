import fs from "node:fs";
import axios from "axios";
import config from "@server/lib/config";
import logger from "@server/logger";

export type CatalogProvider =
    | "openai"
    | "anthropic"
    | "gemini"
    | "vertex"
    | "azure"
    | "bedrock";

export type AiModelCatalogEntry = {
    provider: CatalogProvider;
    model: string;
    pricing: {
        input: number | null;
        output: number | null;
        cacheRead: number | null;
        reasoningOutput: number | null;
    };
};

let catalog: AiModelCatalogEntry[] = [];
let refreshTimer: NodeJS.Timeout | null = null;

async function fetchFromFile(filePath: string): Promise<AiModelCatalogEntry[] | null> {
    try {
        if (!fs.existsSync(filePath)) {
            logger.warn(
                `AI model catalog file not found at ${filePath}; cost calculation will fall back to unknown pricing`
            );
            return null;
        }
        const raw = fs.readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(raw) as { data: AiModelCatalogEntry[] };
        return parsed.data ?? [];
    } catch (error) {
        logger.warn("Failed to read AI model catalog file", { error });
        return null;
    }
}

async function fetchFromUpstream(
    upstreamUrl: string
): Promise<AiModelCatalogEntry[] | null> {
    try {
        const res = await axios.get<{ data: AiModelCatalogEntry[] }>(
            upstreamUrl,
            { timeout: 15_000 }
        );
        return res.data?.data ?? [];
    } catch (error: any) {
        logger.warn(
            `Failed to fetch AI model catalog from ${upstreamUrl}: ${error.message || error}`
        );
        return null;
    }
}

async function refreshCatalog(): Promise<void> {
    const { file, upstream_url } = config.getRawConfig().ai.model_catalog;

    const fetched = file
        ? await fetchFromFile(file)
        : await fetchFromUpstream(upstream_url);

    if (fetched) {
        catalog = fetched;
        logger.debug(
            `AI model catalog refreshed: ${catalog.length} models loaded`
        );
    } else {
        logger.debug(
            "AI model catalog refresh failed; keeping previously loaded catalog in memory"
        );
    }
}

function scheduleNextRefresh(): void {
    const { refresh_interval_min_hours, refresh_interval_max_hours } =
        config.getRawConfig().ai.model_catalog;

    // Jittered rather than fixed so that many self-hosted instances don't
    // all hit the upstream catalog endpoint at the same moment.
    const minMs = refresh_interval_min_hours * 60 * 60 * 1000;
    const maxMs = refresh_interval_max_hours * 60 * 60 * 1000;
    const delayMs = minMs + Math.random() * Math.max(0, maxMs - minMs);

    if (refreshTimer) {
        clearTimeout(refreshTimer);
    }
    refreshTimer = setTimeout(async () => {
        await refreshCatalog();
        scheduleNextRefresh();
    }, delayMs);
}

/**
 * Loads the AI model pricing catalog into memory and schedules periodic
 * background refreshes. Call once at server startup.
 */
export async function initAiModelCatalog(): Promise<void> {
    await refreshCatalog();
    scheduleNextRefresh();
}

export function getAiModelCatalog(): AiModelCatalogEntry[] {
    return catalog;
}
