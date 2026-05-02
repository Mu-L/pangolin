import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import config from "@server/lib/config";
import logger from "@server/logger";
import {
    errorHandlerMiddleware,
    notFoundMiddleware
} from "@server/middlewares";
import { internalRouter } from "#dynamic/routers/internal";
import { stripDuplicateSesions } from "./middlewares/stripDuplicateSessions";
import { requestTimeoutMiddleware } from "./middlewares/requestTimeout";
import rateLimit from "express-rate-limit";

const internalPort = config.getRawConfig().server.internal_port;

export function createInternalServer() {
    const internalServer = express();

    const trustProxy = config.getRawConfig().server.trust_proxy;
    if (trustProxy) {
        internalServer.set("trust proxy", trustProxy);
    }

    internalServer.use(helmet());
    internalServer.use(cors());
    internalServer.use(stripDuplicateSesions);
    internalServer.use(cookieParser());
    internalServer.use(express.json());

    // Prevent requests from hanging indefinitely. Without this, if a
    // database query blocks (especially on SQLite), pending requests
    // accumulate in memory with no upper bound on lifetime.
    internalServer.use(requestTimeoutMiddleware(30000)); // 30 second timeout

    // Rate-limit the internal verify-session endpoint. This server
    // handles forward-auth requests from Traefik/Badger. Under heavy
    // monitoring (e.g. Uptime Kuma), requests can arrive faster than
    // SQLite can serve them, causing unbounded request queuing and
    // memory growth.
    internalServer.use(
        rateLimit({
            windowMs: 60 * 1000, // 1 minute window
            max: 1000, // generous limit: ~17 req/s
            standardHeaders: true,
            legacyHeaders: false
        })
    );

    const prefix = `/api/v1`;
    internalServer.use(prefix, internalRouter);

    internalServer.use(notFoundMiddleware);
    internalServer.use(errorHandlerMiddleware);

    internalServer.listen(internalPort, (err?: any) => {
        if (err) throw err;
        logger.info(
            `Internal API server is running on http://localhost:${internalPort}`
        );
    });

    return internalServer;
}
