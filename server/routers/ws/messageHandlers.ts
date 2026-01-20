import {
    handleNewtRegisterMessage,
    handleReceiveBandwidthMessage,
    handleGetConfigMessage,
    handleDockerStatusMessage,
    handleDockerContainersMessage,
    handleNewtPingRequestMessage,
    handleApplyBlueprintMessage,
    handleNewtPingMessage
} from "../newt";
import {
    handleOlmRegisterMessage,
    handleOlmRelayMessage,
    handleOlmPingMessage,
    startOlmOfflineChecker,
    handleOlmServerPeerAddMessage,
    handleOlmUnRelayMessage,
    handleOlmDisconnecingMessage
} from "../olm";
import { handleHealthcheckStatusMessage } from "../target";
import { MessageHandler } from "./types";

export const messageHandlers: Record<string, MessageHandler> = {
    "olm/wg/server/peer/add": handleOlmServerPeerAddMessage,
    "olm/wg/register": handleOlmRegisterMessage,
    "olm/wg/relay": handleOlmRelayMessage,
    "olm/wg/unrelay": handleOlmUnRelayMessage,
    "olm/ping": handleOlmPingMessage,
    "olm/disconnecting": handleOlmDisconnecingMessage,
    "newt/ping": handleNewtPingMessage,
    "newt/wg/register": handleNewtRegisterMessage,
    "newt/wg/get-config": handleGetConfigMessage,
    "newt/receive-bandwidth": handleReceiveBandwidthMessage,
    "newt/socket/status": handleDockerStatusMessage,
    "newt/socket/containers": handleDockerContainersMessage,
    "newt/ping/request": handleNewtPingRequestMessage,
    "newt/blueprint/apply": handleApplyBlueprintMessage,
    "newt/healthcheck/status": handleHealthcheckStatusMessage
};

startOlmOfflineChecker(); // this is to handle the offline check for olms
