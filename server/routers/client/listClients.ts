import {
    clients,
    clientSitesAssociationsCache,
    currentFingerprint,
    db,
    olms,
    orgs,
    roleClients,
    sites,
    userClients,
    users
} from "@server/db";
import response from "@server/lib/response";
import logger from "@server/logger";
import { OpenAPITags, registry } from "@server/openApi";
import HttpCode from "@server/types/HttpCode";
import type { PaginatedResponse } from "@server/types/Pagination";
import {
    and,
    asc,
    desc,
    eq,
    inArray,
    isNull,
    like,
    or,
    sql,
    type SQL
} from "drizzle-orm";
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

const listClientsParamsSchema = z.strictObject({
    orgId: z.string()
});

const listClientsSchema = z.object({
    pageSize: z.coerce
        .number<string>() // for prettier formatting
        .int()
        .positive()
        .optional()
        .catch(20)
        .default(20)
        .openapi({
            type: "integer",
            default: 20,
            description: "Number of items per page"
        }),
    page: z.coerce
        .number<string>() // for prettier formatting
        .int()
        .min(0)
        .optional()
        .catch(1)
        .default(1)
        .openapi({
            type: "integer",
            default: 1,
            description: "Page number to retrieve"
        }),
    query: z.string().optional(),
    sort_by: z
        .enum(["megabytesIn", "megabytesOut"])
        .optional()
        .catch(undefined)
        .openapi({
            type: "string",
            enum: ["megabytesIn", "megabytesOut"],
            description: "Field to sort by"
        }),
    order: z
        .enum(["asc", "desc"])
        .optional()
        .default("asc")
        .catch("asc")
        .openapi({
            type: "string",
            enum: ["asc", "desc"],
            default: "asc",
            description: "Sort order"
        }),
    online: z
        .enum(["true", "false"])
        .transform((v) => v === "true")
        .optional()
        .catch(undefined)
        .openapi({
            type: "boolean",
            description: "Filter by online status"
        }),
    status: z.preprocess(
        (val: string | undefined) => {
            if (val) {
                return val.split(","); // the search query array is an array joined by commas
            }
            return undefined;
        },
        z
            .array(z.enum(["active", "blocked", "archived"]))
            .optional()
            .default(["active"])
            .catch(["active"])
            .openapi({
                type: "array",
                items: {
                    type: "string",
                    enum: ["active", "blocked", "archived"]
                },
                default: ["active"],
                description:
                    "Filter by client status. Can be a comma-separated list of values. Defaults to 'active'."
            })
    )
});

function queryClientsBase() {
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
            blocked: clients.blocked
        })
        .from(clients)
        .leftJoin(orgs, eq(clients.orgId, orgs.orgId))
        .leftJoin(olms, eq(clients.clientId, olms.clientId))
        .leftJoin(users, eq(clients.userId, users.userId))
        .leftJoin(currentFingerprint, eq(olms.olmId, currentFingerprint.olmId));
}

async function getSiteAssociations(clientIds: number[]) {
    if (clientIds.length === 0) return [];

    return db
        .select({
            clientId: clientSitesAssociationsCache.clientId,
            siteId: clientSitesAssociationsCache.siteId,
            siteName: sites.name,
            siteNiceId: sites.niceId
        })
        .from(clientSitesAssociationsCache)
        .leftJoin(sites, eq(clientSitesAssociationsCache.siteId, sites.siteId))
        .where(inArray(clientSitesAssociationsCache.clientId, clientIds));
}

type ClientWithSites = Awaited<ReturnType<typeof queryClientsBase>>[0] & {
    sites: Array<{
        siteId: number;
        siteName: string | null;
        siteNiceId: string | null;
    }>;
    olmUpdateAvailable?: boolean;
};

type OlmWithUpdateAvailable = ClientWithSites;

export type ListClientsResponse = PaginatedResponse<{
    clients: Array<ClientWithSites>;
}>;

registry.registerPath({
    method: "get",
    path: "/org/{orgId}/clients",
    description: "List all clients for an organization.",
    tags: [OpenAPITags.Client, OpenAPITags.Org],
    request: {
        query: listClientsSchema,
        params: listClientsParamsSchema
    },
    responses: {}
});

export async function listClients(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedQuery = listClientsSchema.safeParse(req.query);
        if (!parsedQuery.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedQuery.error)
                )
            );
        }
        const { page, pageSize, online, query, status, sort_by, order } =
            parsedQuery.data;

        const parsedParams = listClientsParamsSchema.safeParse(req.params);
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
            and(
                inArray(clients.clientId, accessibleClientIds),
                eq(clients.orgId, orgId),
                isNull(clients.userId)
            )
        ];

        if (typeof online !== "undefined") {
            conditions.push(eq(clients.online, online));
        }

        if (status.length > 0) {
            const filterAggregates: (SQL<unknown> | undefined)[] = [];

            if (status.includes("active")) {
                filterAggregates.push(
                    and(eq(clients.archived, false), eq(clients.blocked, false))
                );
            }

            if (status.includes("archived")) {
                filterAggregates.push(eq(clients.archived, true));
            }
            if (status.includes("blocked")) {
                filterAggregates.push(eq(clients.blocked, true));
            }

            conditions.push(or(...filterAggregates));
        }

        if (query) {
            conditions.push(
                or(
                    like(
                        sql`LOWER(${clients.name})`,
                        "%" + query.toLowerCase() + "%"
                    ),
                    like(
                        sql`LOWER(${clients.niceId})`,
                        "%" + query.toLowerCase() + "%"
                    )
                )
            );
        }

        const baseQuery = queryClientsBase().where(and(...conditions));

        const countQuery = db.$count(baseQuery.as("filtered_clients"));

        const listMachinesQuery = baseQuery
            .limit(page)
            .offset(pageSize * (page - 1))
            .orderBy(
                sort_by
                    ? order === "asc"
                        ? asc(clients[sort_by])
                        : desc(clients[sort_by])
                    : asc(clients.clientId)
            );

        const [clientsList, totalCount] = await Promise.all([
            listMachinesQuery,
            countQuery
        ]);

        // Get associated sites for all clients
        const clientIds = clientsList.map((client) => client.clientId);
        const siteAssociations = await getSiteAssociations(clientIds);

        // Group site associations by client ID
        const sitesByClient = siteAssociations.reduce(
            (acc, association) => {
                if (!acc[association.clientId]) {
                    acc[association.clientId] = [];
                }
                acc[association.clientId].push({
                    siteId: association.siteId,
                    siteName: association.siteName,
                    siteNiceId: association.siteNiceId
                });
                return acc;
            },
            {} as Record<
                number,
                Array<{
                    siteId: number;
                    siteName: string | null;
                    siteNiceId: string | null;
                }>
            >
        );

        // Merge clients with their site associations and replace name with device name
        const clientsWithSites = clientsList.map((client) => {
            return {
                ...client,
                sites: sitesByClient[client.clientId] || []
            };
        });

        const latestOlVersionPromise = getLatestOlmVersion();

        const olmsWithUpdates: OlmWithUpdateAvailable[] = clientsWithSites.map(
            (client) => {
                const OlmWithUpdate: OlmWithUpdateAvailable = { ...client };
                // Initially set to false, will be updated if version check succeeds
                OlmWithUpdate.olmUpdateAvailable = false;
                return OlmWithUpdate;
            }
        );

        // Try to get the latest version, but don't block if it fails
        try {
            const latestOlVersion = await latestOlVersionPromise;

            if (latestOlVersion) {
                olmsWithUpdates.forEach((client) => {
                    try {
                        client.olmUpdateAvailable = semver.lt(
                            client.olmVersion ? client.olmVersion : "",
                            latestOlVersion
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

        return response<ListClientsResponse>(res, {
            data: {
                clients: olmsWithUpdates,
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
