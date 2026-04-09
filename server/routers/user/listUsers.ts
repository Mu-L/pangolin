import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db, idpOidcConfig } from "@server/db";
import { idp, roles, userOrgRoles, userOrgs, users } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import { and, eq, inArray, sql } from "drizzle-orm";
import logger from "@server/logger";
import { fromZodError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";

const listUsersParamsSchema = z.strictObject({
    orgId: z.string()
});

const listUsersSchema = z.strictObject({
    limit: z
        .string()
        .optional()
        .default("1000")
        .transform(Number)
        .pipe(z.int().nonnegative()),
    offset: z
        .string()
        .optional()
        .default("0")
        .transform(Number)
        .pipe(z.int().nonnegative())
});

async function queryUsers(orgId: string, limit: number, offset: number) {
    const rows = await db
        .select({
            id: users.userId,
            email: users.email,
            emailVerified: users.emailVerified,
            dateCreated: users.dateCreated,
            orgId: userOrgs.orgId,
            username: users.username,
            name: users.name,
            type: users.type,
            isOwner: userOrgs.isOwner,
            idpName: idp.name,
            idpId: users.idpId,
            idpType: idp.type,
            idpVariant: idpOidcConfig.variant,
            twoFactorEnabled: users.twoFactorEnabled
        })
        .from(users)
        .leftJoin(userOrgs, eq(users.userId, userOrgs.userId))
        .leftJoin(idp, eq(users.idpId, idp.idpId))
        .leftJoin(idpOidcConfig, eq(idpOidcConfig.idpId, idp.idpId))
        .where(eq(userOrgs.orgId, orgId))
        .limit(limit)
        .offset(offset);

    const userIds = rows.map((r) => r.id);
    const roleRows =
        userIds.length === 0
            ? []
            : await db
                  .select({
                      userId: userOrgRoles.userId,
                      roleId: userOrgRoles.roleId,
                      roleName: roles.name
                  })
                  .from(userOrgRoles)
                  .leftJoin(roles, eq(userOrgRoles.roleId, roles.roleId))
                  .where(
                      and(
                          eq(userOrgRoles.orgId, orgId),
                          inArray(userOrgRoles.userId, userIds)
                      )
                  );

    const rolesByUser = new Map<
        string,
        { roleId: number; roleName: string }[]
    >();
    for (const r of roleRows) {
        const list = rolesByUser.get(r.userId) ?? [];
        list.push({ roleId: r.roleId, roleName: r.roleName ?? "" });
        rolesByUser.set(r.userId, list);
    }

    return rows.map((row) => {
        const userRoles = rolesByUser.get(row.id) ?? [];
        return {
            ...row,
            roles: userRoles
        };
    });
}

export type ListUsersResponse = {
    users: NonNullable<Awaited<ReturnType<typeof queryUsers>>>;
    pagination: { total: number; limit: number; offset: number };
};

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
        const { limit, offset } = parsedQuery.data;

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

        const usersWithRoles = await queryUsers(
            orgId.toString(),
            limit,
            offset
        );

        const [{ count }] = await db
            .select({ count: sql<number>`count(*)` })
            .from(userOrgs)
            .where(eq(userOrgs.orgId, orgId));

        return response<ListUsersResponse>(res, {
            data: {
                users: usersWithRoles,
                pagination: {
                    total: count,
                    limit,
                    offset
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
