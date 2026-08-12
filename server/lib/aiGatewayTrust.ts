import { createHash } from "crypto";
import config from "@server/lib/config";

export const AI_GATEWAY_TRUST_HEADER = "X-Pangolin-Ai-Gateway-Auth";

/**
 * Derive a Traefik-injected trust token from the server secret.
 * Traefik overwrites this header on inference routes so the AI gateway can
 * trust Badger-injected Remote-* identity without re-validating credentials.
 */
export function deriveAiGatewayTrustToken(secret: string): string {
    return createHash("sha256")
        .update(`ai-gateway-trust:${secret}`)
        .digest("hex");
}

export function getAiGatewayTrustToken(): string {
    const secret = config.getRawConfig().server.secret;
    if (!secret) {
        throw new Error("Server secret is required for AI gateway trust token");
    }
    return deriveAiGatewayTrustToken(secret);
}

export function isAiGatewayTrustHeaderValid(
    headers: Record<string, string | string[] | undefined> | undefined,
    expectedToken?: string
): boolean {
    if (!headers) {
        return false;
    }
    const expected = expectedToken ?? getAiGatewayTrustToken();
    const raw =
        headers[AI_GATEWAY_TRUST_HEADER] ??
        headers[AI_GATEWAY_TRUST_HEADER.toLowerCase()];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return typeof value === "string" && value === expected;
}
