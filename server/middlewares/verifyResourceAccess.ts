import { Request, Response, NextFunction } from "express";
import { db, Resource } from "@server/db";
import { resources, userOrgs, userResources, roleResources } from "@server/db";
import { and, eq, inArray } from "drizzle-orm";
import createHttpError from "http-errors";
import HttpCode from "@server/types/HttpCode";
import { checkOrgAccessPolicy } from "#dynamic/lib/checkOrgAccessPolicy";
import { getUserOrgRoleIds } from "@server/lib/userOrgRoles";

export async function verifyResourceAccess(
    req: Request,
    res: Response,
    next: NextFunction
) {
    const userId = req.user!.userId;
    const resourceIdStr =
        req.params?.resourceId || req.body?.resourceId || req.query?.resourceId;
    const niceId = req.params?.niceId || req.body?.niceId || req.query?.niceId;
    const orgId = req.params?.orgId || req.body?.orgId || req.query?.orgId;

    try {
        if (!userId) {
            return next(
                createHttpError(HttpCode.UNAUTHORIZED, "User not authenticated")
            );
        }

        let resource: Resource | null = null;

        if (orgId && niceId) {
            const [resourceRes] = await db
                .select()
                .from(resources)
                .where(
                    and(
                        eq(resources.niceId, niceId),
                        eq(resources.orgId, orgId)
                    )
                )
                .limit(1);
            resource = resourceRes;
        } else {
            const resourceId = parseInt(resourceIdStr);
            const [resourceRes] = await db
                .select()
                .from(resources)
                .where(eq(resources.resourceId, resourceId))
                .limit(1);
            resource = resourceRes;
        }

        if (!resource) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Resource with ID ${resourceIdStr || niceId} not found`
                )
            );
        }

        if (!resource.orgId) {
            return next(
                createHttpError(
                    HttpCode.INTERNAL_SERVER_ERROR,
                    `Resource with ID ${resourceIdStr || niceId} does not have an organization ID`
                )
            );
        }

        if (!req.userOrg) {
            const userOrgRole = await db
                .select()
                .from(userOrgs)
                .where(
                    and(
                        eq(userOrgs.userId, userId),
                        eq(userOrgs.orgId, resource.orgId)
                    )
                )
                .limit(1);
            req.userOrg = userOrgRole[0];
        }

        if (!req.userOrg || req.userOrg?.orgId !== resource.orgId) {
            return next(
                createHttpError(
                    HttpCode.FORBIDDEN,
                    "User does not have access to this organization"
                )
            );
        }

        if (req.orgPolicyAllowed === undefined && req.userOrg.orgId) {
            const policyCheck = await checkOrgAccessPolicy({
                orgId: req.userOrg.orgId,
                userId,
                session: req.session
            });
            req.orgPolicyAllowed = policyCheck.allowed;
            if (!policyCheck.allowed || policyCheck.error) {
                return next(
                    createHttpError(
                        HttpCode.FORBIDDEN,
                        "Failed organization access policy check: " +
                            (policyCheck.error || "Unknown error")
                    )
                );
            }
        }

        req.userOrgRoleIds = await getUserOrgRoleIds(
            req.userOrg.userId,
            resource.orgId
        );
        req.userOrgId = resource.orgId;

        const roleResourceAccess =
            (req.userOrgRoleIds?.length ?? 0) > 0
                ? await db
                      .select()
                      .from(roleResources)
                      .where(
                          and(
                              eq(roleResources.resourceId, resource.resourceId),
                              inArray(
                                  roleResources.roleId,
                                  req.userOrgRoleIds!
                              )
                          )
                      )
                      .limit(1)
                : [];

        if (roleResourceAccess.length > 0) {
            return next();
        }

        const userResourceAccess = await db
            .select()
            .from(userResources)
            .where(
                and(
                    eq(userResources.userId, userId),
                    eq(userResources.resourceId, resource.resourceId)
                )
            )
            .limit(1);

        if (userResourceAccess.length > 0) {
            return next();
        }

        return next(
            createHttpError(
                HttpCode.FORBIDDEN,
                "User does not have access to this resource"
            )
        );
    } catch (error) {
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Error verifying resource access"
            )
        );
    }
}
