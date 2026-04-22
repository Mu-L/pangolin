/*
 * This file is part of a proprietary work.
 *
 * Copyright (c) 2025-2026 Fossorial, Inc.
 * All rights reserved.
 *
 * This file is licensed under the Fossorial Commercial License.
 * You may not use this file except in compliance with the License.
 * Unauthorized use, copying, modification, or distribution is strictly prohibited.
 *
 * This file is not licensed under the AGPLv3.
 */

import logger from "@server/logger";
import { AlertContext, WebhookAlertConfig } from "@server/routers/alertRule/types";

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

/**
 * Sends a single webhook POST for an alert event.
 *
 * The payload shape is:
 * ```json
 * {
 *   "event": "site_online",
 *   "timestamp": "2024-01-01T00:00:00.000Z",
 *   "data": { ... }
 * }
 * ```
 *
 * Authentication headers are applied according to `config.authType`,
 * mirroring the same strategies supported by HttpLogDestination:
 * none | bearer | basic | custom.
 */
export async function sendAlertWebhook(
    url: string,
    webhookConfig: WebhookAlertConfig,
    context: AlertContext
): Promise<void> {
    const payload = {
        event: context.eventType,
        timestamp: new Date().toISOString(),
        data: {
            orgId: context.orgId,
            ...context.data
        }
    };

    const body = JSON.stringify(payload);
    const headers = buildHeaders(webhookConfig);

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        let response: Response;
        try {
            response = await fetch(url, {
                method: webhookConfig.method ?? "POST",
                headers,
                body,
                signal: controller.signal
            });
        } catch (err: unknown) {
            clearTimeout(timeoutHandle);
            const isAbort = err instanceof Error && err.name === "AbortError";
            if (isAbort) {
                lastError = new Error(
                    `Alert webhook: request to "${url}" timed out after ${REQUEST_TIMEOUT_MS} ms`
                );
            } else {
                const msg = err instanceof Error ? err.message : String(err);
                lastError = new Error(`Alert webhook: request to "${url}" failed – ${msg}`);
            }
            if (attempt < MAX_RETRIES) {
                const delay = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
                logger.warn(
                    `Alert webhook: attempt ${attempt}/${MAX_RETRIES} failed – retrying in ${delay} ms. ${lastError.message}`
                );
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
            continue;
        } finally {
            clearTimeout(timeoutHandle);
        }

        if (!response.ok) {
            let snippet = "";
            try {
                const text = await response.text();
                snippet = text.slice(0, 300);
            } catch {
                // best-effort
            }
            lastError = new Error(
                `Alert webhook: server at "${url}" returned HTTP ${response.status} ${response.statusText}` +
                    (snippet ? ` – ${snippet}` : "")
            );
            if (attempt < MAX_RETRIES) {
                const delay = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
                logger.warn(
                    `Alert webhook: attempt ${attempt}/${MAX_RETRIES} failed – retrying in ${delay} ms. ${lastError.message}`
                );
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
            continue;
        }

        logger.debug(`Alert webhook sent successfully to "${url}" for event "${context.eventType}" (attempt ${attempt}/${MAX_RETRIES})`);
        return;
    }

    throw lastError ?? new Error(`Alert webhook: all ${MAX_RETRIES} attempts failed for "${url}"`);
}

// ---------------------------------------------------------------------------
// Header construction (mirrors HttpLogDestination.buildHeaders)
// ---------------------------------------------------------------------------

function buildHeaders(webhookConfig: WebhookAlertConfig): Record<string, string> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json"
    };

    switch (webhookConfig.authType) {
        case "bearer": {
            const token = webhookConfig.bearerToken?.trim();
            if (token) {
                headers["Authorization"] = `Bearer ${token}`;
            }
            break;
        }
        case "basic": {
            const creds = webhookConfig.basicCredentials?.trim();
            if (creds) {
                const encoded = Buffer.from(creds).toString("base64");
                headers["Authorization"] = `Basic ${encoded}`;
            }
            break;
        }
        case "custom": {
            const name = webhookConfig.customHeaderName?.trim();
            const value = webhookConfig.customHeaderValue ?? "";
            if (name) {
                headers[name] = value;
            }
            break;
        }
        case "none":
        default:
            break;
    }

    if (webhookConfig.headers) {
        for (const { key, value } of webhookConfig.headers) {
            if (key.trim()) {
                headers[key.trim()] = value;
            }
        }
    }

    return headers;
}
