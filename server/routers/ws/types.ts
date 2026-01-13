import {
    Newt,
    newts,
    NewtSession,
    olms,
    Olm,
    OlmSession,
    RemoteExitNode,
    RemoteExitNodeSession,
    remoteExitNodes
} from "@server/db";
import { IncomingMessage } from "http";
import { WebSocket } from "ws";

// Custom interfaces
export interface WebSocketRequest extends IncomingMessage {
    token?: string;
}

export type ClientType = "newt" | "olm" | "remoteExitNode";

export interface AuthenticatedWebSocket extends WebSocket {
    client?: Newt | Olm | RemoteExitNode;
    clientType?: ClientType;
    connectionId?: string;
    isFullyConnected?: boolean;
    pendingMessages?: Buffer[];
    configVersion?: number;
}

export interface TokenPayload {
    client: Newt | Olm | RemoteExitNode;
    session: NewtSession | OlmSession | RemoteExitNodeSession;
    clientType: ClientType;
}

export interface WSMessage {
    type: string;
    data: any;
    configVersion?: number;
}

export interface HandlerResponse {
    message: WSMessage;
    broadcast?: boolean;
    excludeSender?: boolean;
    targetClientId?: string;
    options?: SendMessageOptions;
}

export interface HandlerContext {
    message: WSMessage;
    senderWs: WebSocket;
    client: Newt | Olm | RemoteExitNode | undefined;
    clientType: ClientType;
    sendToClient: (
        clientId: string,
        message: WSMessage,
        options?: SendMessageOptions
    ) => Promise<boolean>;
    broadcastToAllExcept: (
        message: WSMessage,
        excludeClientId?: string,
        options?: SendMessageOptions
    ) => Promise<void>;
    connectedClients: Map<string, WebSocket[]>;
}

export type MessageHandler = (
    context: HandlerContext
) => Promise<HandlerResponse | void>;

// Options for sending messages with config version tracking
export interface SendMessageOptions {
    incrementConfigVersion?: boolean;
}

// Redis message type for cross-node communication
export interface RedisMessage {
    type: "direct" | "broadcast";
    targetClientId?: string;
    excludeClientId?: string;
    message: WSMessage;
    fromNodeId: string;
    options?: SendMessageOptions;
}
