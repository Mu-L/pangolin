import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
    db,
    resourceHeaderAuth,
    resourceHeaderAuthExtendedCompatibility
} from "@server/db";
import {
    resources,
    userResources,
    roleResources,
    resourcePassword,
    resourcePincode,
    targets,
    targetHealthCheck
} from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import {
    sql,
    eq,
    or,
    inArray,
    and,
    count,
    ilike,
    asc,
    not,
    isNull,
    type SQL
} from "drizzle-orm";
import logger from "@server/logger";
import { fromZodError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";

const listResourcesParamsSchema = z.strictObject({
    orgId: z.string()
});

const listResourcesSchema = z.object({
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
    enabled: z
        .enum(["true", "false"])
        .transform((v) => v === "true")
        .optional()
        .catch(undefined),
    authState: z
        .enum(["protected", "not_protected", "none"])
        .optional()
        .catch(undefined),
    healthStatus: z
        .enum(["no_targets", "healthy", "degraded", "offline", "unknown"])
        .optional()
        .catch(undefined)
});

// (resource fields + a single joined target)
type JoinedRow = {
    resourceId: number;
    niceId: string;
    name: string;
    ssl: boolean;
    fullDomain: string | null;
    passwordId: number | null;
    sso: boolean;
    pincodeId: number | null;
    whitelist: boolean;
    http: boolean;
    protocol: string;
    proxyPort: number | null;
    enabled: boolean;
    domainId: string | null;
    headerAuthId: number | null;

    // total_targets: number;
    // healthy_targets: number;
    // unhealthy_targets: number;
    // unknown_targets: number;

    // targetId: number | null;
    // targetIp: string | null;
    // targetPort: number | null;
    // targetEnabled: boolean | null;

    // hcHealth: string | null;
    // hcEnabled: boolean | null;
};

// grouped by resource with targets[])
export type ResourceWithTargets = {
    resourceId: number;
    name: string;
    ssl: boolean;
    fullDomain: string | null;
    passwordId: number | null;
    sso: boolean;
    pincodeId: number | null;
    whitelist: boolean;
    http: boolean;
    protocol: string;
    proxyPort: number | null;
    enabled: boolean;
    domainId: string | null;
    niceId: string;
    headerAuthId: number | null;
    targets: Array<{
        targetId: number;
        ip: string;
        port: number;
        enabled: boolean;
        healthStatus: "healthy" | "unhealthy" | "unknown" | null;
    }>;
};

// Aggregate filters
const total_targets = count(targets.targetId);
const healthy_targets = sql<number>`SUM(
                    CASE
                    WHEN ${targetHealthCheck.hcHealth} = 'healthy' THEN 1
                    ELSE 0
                    END
                ) `;
const unknown_targets = sql<number>`SUM(
                    CASE
                    WHEN ${targetHealthCheck.hcHealth} = 'unknown' THEN 1
                    ELSE 0
                    END
                ) `;
const unhealthy_targets = sql<number>`SUM(
                    CASE
                    WHEN ${targetHealthCheck.hcHealth} = 'unhealthy' THEN 1
                    ELSE 0
                    END
                ) `;

function countResourcesBase() {
    return db
        .select({ count: count() })
        .from(resources)
        .leftJoin(
            resourcePassword,
            eq(resourcePassword.resourceId, resources.resourceId)
        )
        .leftJoin(
            resourcePincode,
            eq(resourcePincode.resourceId, resources.resourceId)
        )
        .leftJoin(
            resourceHeaderAuth,
            eq(resourceHeaderAuth.resourceId, resources.resourceId)
        )
        .leftJoin(
            resourceHeaderAuthExtendedCompatibility,
            eq(
                resourceHeaderAuthExtendedCompatibility.resourceId,
                resources.resourceId
            )
        )
        .leftJoin(targets, eq(targets.resourceId, resources.resourceId))
        .leftJoin(
            targetHealthCheck,
            eq(targetHealthCheck.targetId, targets.targetId)
        )
        .groupBy(
            resources.resourceId,
            resourcePassword.passwordId,
            resourcePincode.pincodeId,
            resourceHeaderAuth.headerAuthId,
            resourceHeaderAuthExtendedCompatibility.headerAuthExtendedCompatibilityId
        );
}

function queryResourcesBase() {
    return db
        .select({
            resourceId: resources.resourceId,
            name: resources.name,
            ssl: resources.ssl,
            fullDomain: resources.fullDomain,
            passwordId: resourcePassword.passwordId,
            sso: resources.sso,
            pincodeId: resourcePincode.pincodeId,
            whitelist: resources.emailWhitelistEnabled,
            http: resources.http,
            protocol: resources.protocol,
            proxyPort: resources.proxyPort,
            enabled: resources.enabled,
            domainId: resources.domainId,
            niceId: resources.niceId,
            headerAuthId: resourceHeaderAuth.headerAuthId,
            headerAuthExtendedCompatibilityId:
                resourceHeaderAuthExtendedCompatibility.headerAuthExtendedCompatibilityId
        })
        .from(resources)
        .leftJoin(
            resourcePassword,
            eq(resourcePassword.resourceId, resources.resourceId)
        )
        .leftJoin(
            resourcePincode,
            eq(resourcePincode.resourceId, resources.resourceId)
        )
        .leftJoin(
            resourceHeaderAuth,
            eq(resourceHeaderAuth.resourceId, resources.resourceId)
        )
        .leftJoin(
            resourceHeaderAuthExtendedCompatibility,
            eq(
                resourceHeaderAuthExtendedCompatibility.resourceId,
                resources.resourceId
            )
        )
        .leftJoin(targets, eq(targets.resourceId, resources.resourceId))
        .leftJoin(
            targetHealthCheck,
            eq(targetHealthCheck.targetId, targets.targetId)
        )
        .groupBy(
            resources.resourceId,
            resourcePassword.passwordId,
            resourcePincode.pincodeId,
            resourceHeaderAuth.headerAuthId,
            resourceHeaderAuthExtendedCompatibility.headerAuthExtendedCompatibilityId
        );
}

export type ListResourcesResponse = {
    resources: ResourceWithTargets[];
    pagination: { total: number; pageSize: number; page: number };
};

registry.registerPath({
    method: "get",
    path: "/org/{orgId}/resources",
    description: "List resources for an organization.",
    tags: [OpenAPITags.Org, OpenAPITags.Resource],
    request: {
        params: z.object({
            orgId: z.string()
        }),
        query: listResourcesSchema
    },
    responses: {}
});

export async function listResources(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedQuery = listResourcesSchema.safeParse(req.query);
        if (!parsedQuery.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromZodError(parsedQuery.error)
                )
            );
        }
        const { page, pageSize, authState, enabled, query, healthStatus } =
            parsedQuery.data;

        const parsedParams = listResourcesParamsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromZodError(parsedParams.error)
                )
            );
        }

        const orgId =
            parsedParams.data.orgId ||
            req.userOrg?.orgId ||
            req.apiKeyOrg?.orgId;

        if (!orgId) {
            return next(
                createHttpError(HttpCode.BAD_REQUEST, "Invalid organization ID")
            );
        }

        if (req.user && orgId && orgId !== req.userOrgId) {
            return next(
                createHttpError(
                    HttpCode.FORBIDDEN,
                    "User does not have access to this organization"
                )
            );
        }

        let accessibleResources: Array<{ resourceId: number }>;
        if (req.user) {
            accessibleResources = await db
                .select({
                    resourceId: sql<number>`COALESCE(${userResources.resourceId}, ${roleResources.resourceId})`
                })
                .from(userResources)
                .fullJoin(
                    roleResources,
                    eq(userResources.resourceId, roleResources.resourceId)
                )
                .where(
                    or(
                        eq(userResources.userId, req.user!.userId),
                        eq(roleResources.roleId, req.userOrgRoleId!)
                    )
                );
        } else {
            accessibleResources = await db
                .select({
                    resourceId: resources.resourceId
                })
                .from(resources)
                .where(eq(resources.orgId, orgId));
        }

        const accessibleResourceIds = accessibleResources.map(
            (resource) => resource.resourceId
        );

        let conditions = and(
            and(
                inArray(resources.resourceId, accessibleResourceIds),
                eq(resources.orgId, orgId)
            )
        );

        if (query) {
            conditions = and(
                conditions,
                or(
                    ilike(resources.name, "%" + query + "%"),
                    ilike(resources.fullDomain, "%" + query + "%")
                )
            );
        }
        if (typeof enabled !== "undefined") {
            conditions = and(conditions, eq(resources.enabled, enabled));
        }

        if (typeof authState !== "undefined") {
            switch (authState) {
                case "none":
                    conditions = and(conditions, eq(resources.http, false));
                    break;
                case "protected":
                    conditions = and(
                        conditions,
                        or(
                            eq(resources.sso, true),
                            eq(resources.emailWhitelistEnabled, true),
                            not(isNull(resourceHeaderAuth.headerAuthId)),
                            not(isNull(resourcePincode.pincodeId)),
                            not(isNull(resourcePassword.passwordId))
                        )
                    );
                    break;
                case "not_protected":
                    conditions = and(
                        conditions,
                        not(eq(resources.sso, true)),
                        not(eq(resources.emailWhitelistEnabled, true)),
                        isNull(resourceHeaderAuth.headerAuthId),
                        isNull(resourcePincode.pincodeId),
                        isNull(resourcePassword.passwordId)
                    );
                    break;
            }
        }

        let aggregateFilters: SQL<any> | null | undefined = null;

        if (typeof healthStatus !== "undefined") {
            switch (healthStatus) {
                case "healthy":
                    aggregateFilters = and(
                        sql`${total_targets} > 0`,
                        sql`${healthy_targets} = ${total_targets}`
                    );
                    break;
                case "degraded":
                    aggregateFilters = and(
                        sql`${total_targets} > 0`,
                        sql`${unhealthy_targets} > 0`
                    );
                    break;
                case "no_targets":
                    aggregateFilters = sql`${total_targets} = 0`;
                    break;
                case "offline":
                    aggregateFilters = and(
                        sql`${total_targets} > 0`,
                        sql`${healthy_targets} = 0`,
                        sql`${unhealthy_targets} = ${total_targets}`
                    );
                    break;
                case "unknown":
                    aggregateFilters = and(
                        sql`${total_targets} > 0`,
                        sql`${unknown_targets} = ${total_targets}`
                    );
                    break;
            }
        }

        let baseQuery = queryResourcesBase();
        let countQuery = countResourcesBase().where(conditions);

        if (aggregateFilters) {
            // @ts-expect-error idk why this is causing a type error
            baseQuery = baseQuery.having(aggregateFilters);
        }
        if (aggregateFilters) {
            // @ts-expect-error idk why this is causing a type error
            countQuery = countQuery.having(aggregateFilters);
        }

        const rows: JoinedRow[] = await baseQuery
            .where(conditions)
            .limit(pageSize)
            .offset(pageSize * (page - 1))
            .orderBy(asc(resources.resourceId));

        const resourceIdList = rows.map((row) => row.resourceId);
        const allResourceTargets =
            resourceIdList.length === 0
                ? []
                : await db
                      .select({
                          targetId: targets.targetId,
                          resourceId: targets.resourceId,
                          ip: targets.ip,
                          port: targets.port,
                          enabled: targets.enabled,
                          healthStatus: targetHealthCheck.hcHealth,
                          hcEnabled: targetHealthCheck.hcEnabled
                      })
                      .from(targets)
                      .where(sql`${targets.resourceId} in ${resourceIdList}`)
                      .leftJoin(
                          targetHealthCheck,
                          eq(targetHealthCheck.targetId, targets.targetId)
                      );

        // avoids TS issues with reduce/never[]
        const map = new Map<number, ResourceWithTargets>();

        for (const row of rows) {
            let entry = map.get(row.resourceId);
            if (!entry) {
                entry = {
                    resourceId: row.resourceId,
                    niceId: row.niceId,
                    name: row.name,
                    ssl: row.ssl,
                    fullDomain: row.fullDomain,
                    passwordId: row.passwordId,
                    sso: row.sso,
                    pincodeId: row.pincodeId,
                    whitelist: row.whitelist,
                    http: row.http,
                    protocol: row.protocol,
                    proxyPort: row.proxyPort,
                    enabled: row.enabled,
                    domainId: row.domainId,
                    headerAuthId: row.headerAuthId,
                    targets: []
                };
                map.set(row.resourceId, entry);
            }

            entry.targets = allResourceTargets.filter(
                (t) => t.resourceId === entry.resourceId
            );
        }

        const resourcesList: ResourceWithTargets[] = Array.from(map.values());

        const totalCountResult = await countQuery;
        const totalCount = totalCountResult[0]?.count ?? 0;

        return response<ListResourcesResponse>(res, {
            data: {
                resources: resourcesList,
                pagination: {
                    total: totalCount,
                    pageSize,
                    page
                }
            },
            success: true,
            error: false,
            message: "Resources retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
