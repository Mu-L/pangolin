import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db, idpOidcConfig } from "@server/db";
import { idp, roles, userOrgs, users } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import { and, asc, desc, like, or, sql, type SQL } from "drizzle-orm";
import logger from "@server/logger";
import { fromZodError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";
import { eq } from "drizzle-orm";
import type { PaginatedResponse } from "@server/types/Pagination";

const listUsersParamsSchema = z.strictObject({
    orgId: z.string()
});

const listUsersSchema = z.strictObject({
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
        .enum(["username"])
        .optional()
        .catch(undefined)
        .openapi({
            type: "string",
            enum: ["username"],
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
        })
});

function queryUsersBase() {
    return db
        .select({
            id: users.userId,
            email: users.email,
            emailVerified: users.emailVerified,
            dateCreated: users.dateCreated,
            orgId: userOrgs.orgId,
            username: users.username,
            name: users.name,
            type: users.type,
            roleId: userOrgs.roleId,
            roleName: roles.name,
            isOwner: userOrgs.isOwner,
            idpName: idp.name,
            idpId: users.idpId,
            idpType: idp.type,
            idpVariant: idpOidcConfig.variant,
            twoFactorEnabled: users.twoFactorEnabled
        })
        .from(users)
        .leftJoin(userOrgs, eq(users.userId, userOrgs.userId))
        .leftJoin(roles, eq(userOrgs.roleId, roles.roleId))
        .leftJoin(idp, eq(users.idpId, idp.idpId))
        .leftJoin(idpOidcConfig, eq(idpOidcConfig.idpId, idp.idpId));
}

export type ListUsersResponse = PaginatedResponse<{
    users: NonNullable<Awaited<ReturnType<typeof queryUsersBase>>>;
}>;

registry.registerPath({
    method: "get",
    path: "/org/{orgId}/users",
    description: "List users in an organization.",
    tags: [OpenAPITags.User],
    request: {
        params: listUsersParamsSchema,
        query: listUsersSchema
    },
    responses: {}
});

export async function listUsers(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedQuery = listUsersSchema.safeParse(req.query);
        if (!parsedQuery.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromZodError(parsedQuery.error)
                )
            );
        }
        const { page, pageSize, sort_by, order, query } = parsedQuery.data;

        const parsedParams = listUsersParamsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromZodError(parsedParams.error)
                )
            );
        }

        const { orgId } = parsedParams.data;

        const conditions = [and(eq(userOrgs.orgId, orgId))];

        if (query) {
            conditions.push(
                or(
                    like(
                        sql`LOWER(${users.name})`,
                        "%" + query.toLowerCase() + "%"
                    ),
                    like(
                        sql`LOWER(${users.username})`,
                        "%" + query.toLowerCase() + "%"
                    ),
                    like(
                        sql`LOWER(${users.email})`,
                        "%" + query.toLowerCase() + "%"
                    )
                )
            );
        }

        const countQuery = db.$count(
            queryUsersBase()
                .where(and(...conditions))
                .as("filtered_users")
        );

        const userListQuery = queryUsersBase()
            .where(and(...conditions))
            .limit(pageSize)
            .offset(pageSize * (page - 1))
            .orderBy(
                sort_by
                    ? order === "asc"
                        ? asc(users[sort_by])
                        : desc(users[sort_by])
                    : asc(users.name)
            );

        const [count, usersWithRoles] = await Promise.all([
            countQuery,
            userListQuery
        ]);

        return response<ListUsersResponse>(res, {
            data: {
                users: usersWithRoles,
                pagination: {
                    total: count,
                    page,
                    pageSize
                }
            },
            success: true,
            error: false,
            message: "Users retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
