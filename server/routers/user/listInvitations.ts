import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import { userInvites, roles } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import { sql } from "drizzle-orm";
import logger from "@server/logger";
import { fromZodError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";

const listInvitationsParamsSchema = z.strictObject({
    orgId: z.string()
});

const listInvitationsQuerySchema = z.strictObject({
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

async function queryInvitations(orgId: string, limit: number, offset: number) {
    return await db
        .select({
            inviteId: userInvites.inviteId,
            email: userInvites.email,
            expiresAt: userInvites.expiresAt,
            roleId: userInvites.roleId,
            roleName: roles.name
        })
        .from(userInvites)
        .leftJoin(roles, sql`${userInvites.roleId} = ${roles.roleId}`)
        .where(sql`${userInvites.orgId} = ${orgId}`)
        .limit(limit)
        .offset(offset);
}

export type ListInvitationsResponse = {
    invitations: NonNullable<Awaited<ReturnType<typeof queryInvitations>>>;
    pagination: { total: number; limit: number; offset: number };
};

registry.registerPath({
    method: "get",
    path: "/org/{orgId}/invitations",
    description: "List invitations in an organization.",
    tags: [OpenAPITags.Invitation],
    request: {
        params: listInvitationsParamsSchema,
        query: listInvitationsQuerySchema
    },
    responses: {}
});

export async function listInvitations(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedQuery = listInvitationsQuerySchema.safeParse(req.query);
        if (!parsedQuery.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromZodError(parsedQuery.error)
                )
            );
        }
        const { limit, offset } = parsedQuery.data;

        const parsedParams = listInvitationsParamsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromZodError(parsedParams.error)
                )
            );
        }
        const { orgId } = parsedParams.data;

        const invitations = await queryInvitations(orgId, limit, offset);

        const [{ count }] = await db
            .select({ count: sql<number>`count(*)` })
            .from(userInvites)
            .where(sql`${userInvites.orgId} = ${orgId}`);

        return response<ListInvitationsResponse>(res, {
            data: {
                invitations,
                pagination: {
                    total: count,
                    limit,
                    offset
                }
            },
            success: true,
            error: false,
            message: "Invitations retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
