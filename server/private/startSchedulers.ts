import { build } from "@server/build";
import { startRemoteExitNodeOfflineChecker } from "./routers/remoteExitNode";
import { startExitNodeReconnectScheduler } from "./routers/remoteExitNode/exitNodeReconnectScheduler";
import { startSchedulers as ossStartSchedulers } from "@server/startSchedulers";

export function startSchedulers() {
    if (build != "saas") {
        startRemoteExitNodeOfflineChecker(); // this is to handle the offline check for remote exit nodes
        startExitNodeReconnectScheduler(); // check pending exit node reconnects and notify newts
    }
    ossStartSchedulers();
}
