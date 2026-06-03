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
    resourcePolicyRules,
    resources,
    roleResources,
    rolePolicies,
    sessions,
    userResources,
    userPolicies,
    users,
    ResourceHeaderAuthExtendedCompatibility,
    resourceHeaderAuthExtendedCompatibility,
    resourcePolicies,
    resourcePolicyPincode,
    ResourcePolicyPincode,
    resourcePolicyPassword,
    ResourcePolicyPassword,
    resourcePolicyHeaderAuth,
    ResourcePolicyHeaderAuth
} from "@server/db";
import { and, eq, inArray, or, sql } from "drizzle-orm";

export type ResourceWithAuth = {
    resource: Resource | null;
    pincode: ResourcePincode | ResourcePolicyPincode | null;
    password: ResourcePassword | ResourcePolicyPassword | null;
    headerAuth: ResourceHeaderAuth | ResourcePolicyHeaderAuth | null;
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
        .leftJoin(
            resourcePolicies,
            eq(resourcePolicies.resourcePolicyId, resources.resourcePolicyId)
        )
        .leftJoin(
            resourcePolicyPincode,
            eq(
                resourcePolicyPincode.resourcePolicyId,
                resourcePolicies.resourcePolicyId
            )
        )
        .leftJoin(
            resourcePolicyPassword,
            eq(
                resourcePolicyPassword.resourcePolicyId,
                resourcePolicies.resourcePolicyId
            )
        )
        .leftJoin(
            resourcePolicyHeaderAuth,
            eq(
                resourcePolicyHeaderAuth.resourcePolicyId,
                resourcePolicies.resourcePolicyId
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
        pincode: result.resourcePolicyPincode ?? result.resourcePincode,
        password: result.resourcePolicyPassword ?? result.resourcePassword,
        headerAuth:
            result.resourcePolicyHeaderAuth ?? result.resourceHeaderAuth,
        headerAuthExtendedCompatibility: result.resourcePolicyHeaderAuth
            ? ({
                  headerAuthExtendedCompatibilityId: 0,
                  resourceId: result.resources.resourceId,
                  extendedCompatibilityIsActivated:
                      result.resourcePolicyHeaderAuth.extendedCompatibility
              } as ResourceHeaderAuthExtendedCompatibility)
            : result.resourceHeaderAuthExtendedCompatibility,
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
 * Check if role has access to resource (direct or via resource policy)
 */
export async function getRoleResourceAccess(
    resourceId: number,
    roleIds: number[]
) {
    const [direct, viaPolicies] = await Promise.all([
        db
            .select()
            .from(roleResources)
            .where(
                and(
                    eq(roleResources.resourceId, resourceId),
                    inArray(roleResources.roleId, roleIds)
                )
            ),
        db
            .select({
                roleId: rolePolicies.roleId,
                resourcePolicyId: rolePolicies.resourcePolicyId
            })
            .from(rolePolicies)
            .innerJoin(
                resources,
                eq(resources.resourcePolicyId, rolePolicies.resourcePolicyId)
            )
            .where(
                and(
                    eq(resources.resourceId, resourceId),
                    inArray(rolePolicies.roleId, roleIds)
                )
            )
    ]);

    const combined = [...direct, ...viaPolicies];
    return combined.length > 0 ? combined : null;
}

/**
 * Check if user has access to resource (direct or via resource policy)
 */
export async function getUserResourceAccess(
    userId: string,
    resourceId: number
) {
    const [direct, viaPolicies] = await Promise.all([
        db
            .select()
            .from(userResources)
            .where(
                and(
                    eq(userResources.userId, userId),
                    eq(userResources.resourceId, resourceId)
                )
            )
            .limit(1),
        db
            .select({
                userId: userPolicies.userId,
                resourcePolicyId: userPolicies.resourcePolicyId
            })
            .from(userPolicies)
            .innerJoin(
                resources,
                eq(resources.resourcePolicyId, userPolicies.resourcePolicyId)
            )
            .where(
                and(
                    eq(resources.resourceId, resourceId),
                    eq(userPolicies.userId, userId)
                )
            )
            .limit(1)
    ]);

    return direct[0] ?? viaPolicies[0] ?? null;
}

/**
 * Get resource rules for a given resource (direct and via resource policy)
 */
export async function getResourceRules(
    resourceId: number
): Promise<ResourceRule[]> {
    const [directRules, policyRules] = await Promise.all([
        db
            .select()
            .from(resourceRules)
            .where(eq(resourceRules.resourceId, resourceId)),
        db
            .select({
                ruleId: resourcePolicyRules.ruleId,
                resourceId: sql<number>`${resourceId}`,
                enabled: resourcePolicyRules.enabled,
                priority: resourcePolicyRules.priority,
                action: resourcePolicyRules.action,
                match: resourcePolicyRules.match,
                value: resourcePolicyRules.value
            })
            .from(resourcePolicyRules)
            .innerJoin(
                resources,
                eq(
                    resources.resourcePolicyId,
                    resourcePolicyRules.resourcePolicyId
                )
            )
            .where(eq(resources.resourceId, resourceId))
    ]);

    const maxDirectPriority = directRules.reduce(
        (max, r) => Math.max(max, r.priority),
        0
    );
    const offsetPolicyRules = policyRules.map((r) => ({
        ...r,
        priority: maxDirectPriority + r.priority
    }));

    return [...directRules, ...offsetPolicyRules] as ResourceRule[];
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
