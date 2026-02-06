import {
    clients,
    currentFingerprint,
    db,
    olms,
    orgs,
    roleClients,
    userClients,
    users
} from "@server/db";
import { getUserDeviceName } from "@server/db/names";
import response from "@server/lib/response";
import logger from "@server/logger";
import { OpenAPITags, registry } from "@server/openApi";
import HttpCode from "@server/types/HttpCode";
import type { PaginatedResponse } from "@server/types/Pagination";
import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";
import createHttpError from "http-errors";
import NodeCache from "node-cache";
import semver from "semver";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const olmVersionCache = new NodeCache({ stdTTL: 3600 });

async function getLatestOlmVersion(): Promise<string | null> {
    try {
        const cachedVersion = olmVersionCache.get<string>("latestOlmVersion");
        if (cachedVersion) {
            return cachedVersion;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);

        const response = await fetch(
            "https://api.github.com/repos/fosrl/olm/tags",
            {
                signal: controller.signal
            }
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
            logger.warn(
                `Failed to fetch latest Olm version from GitHub: ${response.status} ${response.statusText}`
            );
            return null;
        }

        let tags = await response.json();
        if (!Array.isArray(tags) || tags.length === 0) {
            logger.warn("No tags found for Olm repository");
            return null;
        }
        tags = tags.filter((version) => !version.name.includes("rc"));
        const latestVersion = tags[0].name;

        olmVersionCache.set("latestOlmVersion", latestVersion);

        return latestVersion;
    } catch (error: any) {
        if (error.name === "AbortError") {
            logger.warn("Request to fetch latest Olm version timed out (1.5s)");
        } else if (error.cause?.code === "UND_ERR_CONNECT_TIMEOUT") {
            logger.warn("Connection timeout while fetching latest Olm version");
        } else {
            logger.warn(
                "Error fetching latest Olm version:",
                error.message || error
            );
        }
        return null;
    }
}

const listUserDevicesParamsSchema = z.strictObject({
    orgId: z.string()
});

const listUserDevicesSchema = z.object({
    pageSize: z.coerce
        .number<string>() // for prettier formatting
        .int()
        .positive()
        .optional()
        .catch(20)
        .default(20),
    page: z.coerce
        .number<string>() // for prettier formatting
        .int()
        .min(0)
        .optional()
        .catch(1)
        .default(1),
    query: z.string().optional(),
    sort_by: z.enum(["megabytesIn", "megabytesOut"]).optional().catch(undefined)
});

function queryUserDevicesBase() {
    return db
        .select({
            clientId: clients.clientId,
            orgId: clients.orgId,
            name: clients.name,
            pubKey: clients.pubKey,
            subnet: clients.subnet,
            megabytesIn: clients.megabytesIn,
            megabytesOut: clients.megabytesOut,
            orgName: orgs.name,
            type: clients.type,
            online: clients.online,
            olmVersion: olms.version,
            userId: clients.userId,
            username: users.username,
            userEmail: users.email,
            niceId: clients.niceId,
            agent: olms.agent,
            approvalState: clients.approvalState,
            olmArchived: olms.archived,
            archived: clients.archived,
            blocked: clients.blocked,
            deviceModel: currentFingerprint.deviceModel,
            fingerprintPlatform: currentFingerprint.platform,
            fingerprintOsVersion: currentFingerprint.osVersion,
            fingerprintKernelVersion: currentFingerprint.kernelVersion,
            fingerprintArch: currentFingerprint.arch,
            fingerprintSerialNumber: currentFingerprint.serialNumber,
            fingerprintUsername: currentFingerprint.username,
            fingerprintHostname: currentFingerprint.hostname
        })
        .from(clients)
        .leftJoin(orgs, eq(clients.orgId, orgs.orgId))
        .leftJoin(olms, eq(clients.clientId, olms.clientId))
        .leftJoin(users, eq(clients.userId, users.userId))
        .leftJoin(currentFingerprint, eq(olms.olmId, currentFingerprint.olmId));
}

type OlmWithUpdateAvailable = Awaited<
    ReturnType<typeof queryUserDevicesBase>
>[0] & {
    olmUpdateAvailable?: boolean;
};

export type ListUserDevicesResponse = PaginatedResponse<{
    devices: Array<OlmWithUpdateAvailable>;
}>;

registry.registerPath({
    method: "get",
    path: "/org/{orgId}/user-devices",
    description: "List all user devices for an organization.",
    tags: [OpenAPITags.Client, OpenAPITags.Org],
    request: {
        query: listUserDevicesSchema,
        params: listUserDevicesParamsSchema
    },
    responses: {}
});

export async function listUserDevices(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedQuery = listUserDevicesSchema.safeParse(req.query);
        if (!parsedQuery.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedQuery.error)
                )
            );
        }
        const { page, pageSize, query } = parsedQuery.data;

        const parsedParams = listUserDevicesParamsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error)
                )
            );
        }
        const { orgId } = parsedParams.data;

        if (req.user && orgId && orgId !== req.userOrgId) {
            return next(
                createHttpError(
                    HttpCode.FORBIDDEN,
                    "User does not have access to this organization"
                )
            );
        }

        let accessibleClients;
        if (req.user) {
            accessibleClients = await db
                .select({
                    clientId: sql<number>`COALESCE(${userClients.clientId}, ${roleClients.clientId})`
                })
                .from(userClients)
                .fullJoin(
                    roleClients,
                    eq(userClients.clientId, roleClients.clientId)
                )
                .where(
                    or(
                        eq(userClients.userId, req.user!.userId),
                        eq(roleClients.roleId, req.userOrgRoleId!)
                    )
                );
        } else {
            accessibleClients = await db
                .select({ clientId: clients.clientId })
                .from(clients)
                .where(eq(clients.orgId, orgId));
        }

        const accessibleClientIds = accessibleClients.map(
            (client) => client.clientId
        );
        // Get client count with filter
        const conditions = [
            inArray(clients.clientId, accessibleClientIds),
            eq(clients.orgId, orgId),
            isNotNull(clients.userId)
        ];

        const baseQuery = queryUserDevicesBase().where(and(...conditions));

        const countQuery = db.$count(baseQuery.as("filtered_clients"));

        const [clientsList, totalCount] = await Promise.all([
            baseQuery.limit(pageSize).offset(pageSize * (page - 1)),
            countQuery
        ]);

        // Merge clients with their site associations and replace name with device name
        const olmsWithUpdates: OlmWithUpdateAvailable[] = clientsList.map(
            (client) => {
                const model = client.deviceModel || null;
                const newName = getUserDeviceName(model, client.name);
                const OlmWithUpdate: OlmWithUpdateAvailable = {
                    ...client,
                    name: newName
                };
                // Initially set to false, will be updated if version check succeeds
                OlmWithUpdate.olmUpdateAvailable = false;
                return OlmWithUpdate;
            }
        );

        // Try to get the latest version, but don't block if it fails
        try {
            const latestOlmVersion = await getLatestOlmVersion();

            if (latestOlmVersion) {
                olmsWithUpdates.forEach((client) => {
                    try {
                        client.olmUpdateAvailable = semver.lt(
                            client.olmVersion ? client.olmVersion : "",
                            latestOlmVersion
                        );
                    } catch (error) {
                        client.olmUpdateAvailable = false;
                    }
                });
            }
        } catch (error) {
            // Log the error but don't let it block the response
            logger.warn(
                "Failed to check for OLM updates, continuing without update info:",
                error
            );
        }

        return response<ListUserDevicesResponse>(res, {
            data: {
                devices: olmsWithUpdates,
                pagination: {
                    total: totalCount,
                    page,
                    pageSize
                }
            },
            success: true,
            error: false,
            message: "Clients retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
