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

import { db, exitNodes } from "@server/db";
import { MessageHandler } from "@server/routers/ws";
import { RemoteExitNode } from "@server/db";
import { eq } from "drizzle-orm";
import logger from "@server/logger";

/**
 * Handles ping messages from clients and responds with pong
 */
export const handleRemoteExitNodePingMessage: MessageHandler = async (
    context
) => {
    const { message, client: c, sendToClient } = context;
    const remoteExitNode = c as RemoteExitNode;

    if (!remoteExitNode) {
        logger.debug("RemoteExitNode not found");
        return;
    }

    if (!remoteExitNode.exitNodeId) {
        logger.debug("RemoteExitNode has no exit node ID!"); // this can happen if the exit node is created but not adopted yet
        return;
    }

    try {
        // Update the exit node's last ping timestamp
        await db
            .update(exitNodes)
            .set({
                lastPing: Math.floor(Date.now() / 1000),
                online: true
            })
            .where(eq(exitNodes.exitNodeId, remoteExitNode.exitNodeId));
    } catch (error) {
        logger.error("Error handling ping message", { error });
    }

    return {
        message: {
            type: "pong",
            data: {
                timestamp: new Date().toISOString()
            }
        },
        broadcast: false,
        excludeSender: false
    };
};
