import { Target, TargetHealthCheck, db, targetHealthCheck } from "@server/db";
import { sendToClient } from "#dynamic/routers/ws";
import logger from "@server/logger";
import { eq, inArray } from "drizzle-orm";

export async function addTargets(
    newtId: string,
    targets: Target[],
    healthCheckData: TargetHealthCheck[],
    protocol: string,
    port: number | null = null
) {
    //create a list of udp and tcp targets
    const payloadTargets = targets.map((target) => {
        return `${target.internalPort ? target.internalPort + ":" : ""}${
            target.ip
        }:${target.port}`;
    });

    await sendToClient(newtId, {
        type: `newt/${protocol}/add`,
        data: {
            targets: payloadTargets
        }
    }, { incrementConfigVersion: true });

    // Create a map for quick lookup
    const healthCheckMap = new Map<number, TargetHealthCheck>();
    healthCheckData.forEach((hc) => {
        healthCheckMap.set(hc.targetId, hc);
    });

    const healthCheckTargets = targets.map((target) => {
        const hc = healthCheckMap.get(target.targetId);

        // If no health check data found, skip this target
        if (!hc) {
            logger.warn(
                `No health check configuration found for target ${target.targetId}`
            );
            return null;
        }

        // Ensure all necessary fields are present
        if (
            !hc.hcPath ||
            !hc.hcHostname ||
            !hc.hcPort ||
            !hc.hcInterval ||
            !hc.hcMethod
        ) {
            logger.debug(
                `Skipping target ${target.targetId} due to missing health check fields`
            );
            return null; // Skip targets with missing health check fields
        }

        const hcHeadersParse = hc.hcHeaders ? JSON.parse(hc.hcHeaders) : null;
        const hcHeadersSend: { [key: string]: string } = {};
        if (hcHeadersParse) {
            // transform
            hcHeadersParse.forEach(
                (header: { name: string; value: string }) => {
                    hcHeadersSend[header.name] = header.value;
                }
            );
        }

        // try to parse the hcStatus into a int and if not possible set to undefined
        let hcStatus: number | undefined = undefined;
        if (hc.hcStatus) {
            const parsedStatus = parseInt(hc.hcStatus.toString());
            if (!isNaN(parsedStatus)) {
                hcStatus = parsedStatus;
            }
        }

        return {
            id: target.targetId,
            hcEnabled: hc.hcEnabled,
            hcPath: hc.hcPath,
            hcScheme: hc.hcScheme,
            hcMode: hc.hcMode,
            hcHostname: hc.hcHostname,
            hcPort: hc.hcPort,
            hcInterval: hc.hcInterval, // in seconds
            hcUnhealthyInterval: hc.hcUnhealthyInterval, // in seconds
            hcTimeout: hc.hcTimeout, // in seconds
            hcHeaders: hcHeadersSend,
            hcMethod: hc.hcMethod,
            hcStatus: hcStatus,
            hcTlsServerName: hc.hcTlsServerName
        };
    });

    // Filter out any null values from health check targets
    const validHealthCheckTargets = healthCheckTargets.filter(
        (target) => target !== null
    );

    await sendToClient(newtId, {
        type: `newt/healthcheck/add`,
        data: {
            targets: validHealthCheckTargets
        }
    }, { incrementConfigVersion: true });
}

export async function removeTargets(
    newtId: string,
    targets: Target[],
    protocol: string,
    port: number | null = null
) {
    //create a list of udp and tcp targets
    const payloadTargets = targets.map((target) => {
        return `${target.internalPort ? target.internalPort + ":" : ""}${
            target.ip
        }:${target.port}`;
    });

    await sendToClient(newtId, {
        type: `newt/${protocol}/remove`,
        data: {
            targets: payloadTargets
        }
    }, { incrementConfigVersion: true });

    const healthCheckTargets = targets.map((target) => {
        return target.targetId;
    });

    await sendToClient(newtId, {
        type: `newt/healthcheck/remove`,
        data: {
            ids: healthCheckTargets
        }
    }, { incrementConfigVersion: true });
}
