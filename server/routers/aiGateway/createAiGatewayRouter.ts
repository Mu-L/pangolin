import { Router } from "express";
import {
    AI_CAPABILITY_DEFS,
    type AiCapability
} from "@server/lib/aiCapabilities";
import { handleAiGatewayProxy } from "@server/routers/aiGateway/pipeline";

export function createAiGatewayRouter() {
    const router = Router();

    for (const def of Object.values(AI_CAPABILITY_DEFS)) {
        const capability = def.id as AiCapability;
        for (const route of def.routes) {
            router.post(route.path, (req, res) =>
                handleAiGatewayProxy(req, res, capability)
            );
        }
    }

    return router;
}
