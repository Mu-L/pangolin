import { db } from "@server/db";
import { and, eq } from "drizzle-orm";
import { roleSiteResources, userSiteResources } from "@server/db";

export async function canUserAccessSiteResource({
    userId,
    resourceId,
    roleId
}: {
    userId: string;
    resourceId: number;
    roleId: number;
}): Promise<boolean> {
    const roleResourceAccess = await db
        .select()
        .from(roleSiteResources)
        .where(
            and(
                eq(roleSiteResources.siteResourceId, resourceId),
                eq(roleSiteResources.roleId, roleId)
            )
        )
        .limit(1);

    if (roleResourceAccess.length > 0) {
        return true;
    }

    const userResourceAccess = await db
        .select()
        .from(userSiteResources)
        .where(
            and(
                eq(userSiteResources.userId, userId),
                eq(userSiteResources.siteResourceId, resourceId)
            )
        )
        .limit(1);

    if (userResourceAccess.length > 0) {
        return true;
    }

    return false;
}
