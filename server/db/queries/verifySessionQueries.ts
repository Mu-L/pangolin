import {
    db,
    loginPage,
    LoginPage,
    loginPageOrg,
    Org,
    orgs,
    roles
} from "@server/db";
import {
    Resource,
    ResourcePassword,
    ResourcePincode,
    ResourceRule,
    resourcePassword,
    resourcePincode,
    resourceHeaderAuth,
    ResourceHeaderAuth,
    resourceRules,
    resources,
    roleResources,
    sessions,
    userResources,
    users,
    ResourceHeaderAuthExtendedCompatibility,
    resourceHeaderAuthExtendedCompatibility
} from "@server/db";
import { and, eq, inArray, or, sql } from "drizzle-orm";

export type ResourceWithAuth = {
    resource: Resource | null;
    pincode: ResourcePincode | null;
    password: ResourcePassword | null;
    headerAuth: ResourceHeaderAuth | null;
    headerAuthExtendedCompatibility: ResourceHeaderAuthExtendedCompatibility | null;
    org: Org;
};

export type UserSessionWithUser = {
    session: any;
    user: any;
};

/**
 * Get resource by domain with pincode and password information
 */
export async function getResourceByDomain(
    domain: string
): Promise<ResourceWithAuth | null> {
    // Build wildcard domain variants to match against.
    // For a domain like "me.example.test.com", we want to match:
    //   - "*.example.test.com" (subdomain wildcard)
    //   - "*.test.com" (parent wildcard, i.e. just "*" subdomain on parent)
    const parts = domain.split(".");
    const wildcardCandidates: string[] = [];
    for (let i = 1; i < parts.length; i++) {
        wildcardCandidates.push(`*.${parts.slice(i).join(".")}`);
    }

    const potentialResults = await db
        .select()
        .from(resources)
        .leftJoin(
            resourcePincode,
            eq(resourcePincode.resourceId, resources.resourceId)
        )
        .leftJoin(
            resourcePassword,
            eq(resourcePassword.resourceId, resources.resourceId)
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
        .innerJoin(orgs, eq(orgs.orgId, resources.orgId))
        .where(
            or(
                // Exact match
                eq(resources.fullDomain, domain),
                // Wildcard match: resource fullDomain is one of the wildcard candidates
                wildcardCandidates.length > 0
                    ? and(
                          eq(resources.wildcard, true),
                          inArray(resources.fullDomain, wildcardCandidates)
                      )
                    : sql`false`
            )
        );

    if (!potentialResults.length) {
        return null;
    }

    // Prefer exact match over wildcard match
    const exactMatch = potentialResults.find(
        (r) => r.resources?.fullDomain === domain
    );
    const result = exactMatch ?? potentialResults[0];

    if (!result) {
        return null;
    }

    return {
        resource: result.resources,
        pincode: result.resourcePincode,
        password: result.resourcePassword,
        headerAuth: result.resourceHeaderAuth,
        headerAuthExtendedCompatibility:
            result.resourceHeaderAuthExtendedCompatibility,
        org: result.orgs
    };
}

/**
 * Get user session with user information
 */
export async function getUserSessionWithUser(
    userSessionId: string
): Promise<UserSessionWithUser | null> {
    const [res] = await db
        .select()
        .from(sessions)
        .leftJoin(users, eq(users.userId, sessions.userId))
        .where(eq(sessions.sessionId, userSessionId));

    if (!res) {
        return null;
    }

    return {
        session: res.session,
        user: res.user
    };
}

/**
 * Get role name by role ID (for display).
 */
export async function getRoleName(roleId: number): Promise<string | null> {
    const [row] = await db
        .select({ name: roles.name })
        .from(roles)
        .where(eq(roles.roleId, roleId))
        .limit(1);
    return row?.name ?? null;
}

/**
 * Check if role has access to resource
 */
export async function getRoleResourceAccess(
    resourceId: number,
    roleIds: number[]
) {
    const roleResourceAccess = await db
        .select()
        .from(roleResources)
        .where(
            and(
                eq(roleResources.resourceId, resourceId),
                inArray(roleResources.roleId, roleIds)
            )
        );

    return roleResourceAccess.length > 0 ? roleResourceAccess : null;
}

/**
 * Check if user has direct access to resource
 */
export async function getUserResourceAccess(
    userId: string,
    resourceId: number
) {
    const userResourceAccess = await db
        .select()
        .from(userResources)
        .where(
            and(
                eq(userResources.userId, userId),
                eq(userResources.resourceId, resourceId)
            )
        )
        .limit(1);

    return userResourceAccess.length > 0 ? userResourceAccess[0] : null;
}

/**
 * Get resource rules for a given resource
 */
export async function getResourceRules(
    resourceId: number
): Promise<ResourceRule[]> {
    const rules = await db
        .select()
        .from(resourceRules)
        .where(eq(resourceRules.resourceId, resourceId));

    return rules;
}

/**
 * Get organization login page
 */
export async function getOrgLoginPage(
    orgId: string
): Promise<LoginPage | null> {
    const [result] = await db
        .select()
        .from(loginPageOrg)
        .where(eq(loginPageOrg.orgId, orgId))
        .innerJoin(
            loginPage,
            eq(loginPageOrg.loginPageId, loginPage.loginPageId)
        )
        .limit(1);

    if (!result) {
        return null;
    }

    return result?.loginPage;
}
