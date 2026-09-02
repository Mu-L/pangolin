import { and, asc, eq, or } from "drizzle-orm";
import { Transaction, User, userOrgs, users } from "@server/db";

export async function findOrgUserByIdentifier(
    trx: Transaction,
    orgId: string,
    identifier: string
): Promise<User | null> {
    const [match] = await trx
        .select()
        .from(users)
        .innerJoin(userOrgs, eq(users.userId, userOrgs.userId))
        .where(
            and(
                or(eq(users.username, identifier), eq(users.email, identifier)),
                eq(userOrgs.orgId, orgId)
            )
        )
        .orderBy(asc(users.dateCreated), asc(users.userId))
        .limit(1);

    return match?.user ?? null;
}

export async function resolveOrgUserIds(
    trx: Transaction,
    orgId: string,
    identifiers: string[]
): Promise<string[]> {
    const userIds = new Set<string>();
    for (const identifier of identifiers) {
        const user = await findOrgUserByIdentifier(trx, orgId, identifier);
        if (user) {
            userIds.add(user.userId);
        }
    }
    return [...userIds];
}
