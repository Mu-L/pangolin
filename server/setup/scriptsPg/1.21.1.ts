import { db } from "@server/db/pg/driver";
import { sql } from "drizzle-orm";

const version = "1.21.1";

const actionsToGrant = ["getSiteResource", "listSiteResources"] as const;

export default async function migration() {
    console.log(`Running setup script ${version}...`);

    try {
        await db.execute(sql`BEGIN`);

        for (const actionId of actionsToGrant) {
            await db.execute(sql`
                INSERT INTO "roleActions" ("roleId", "actionId", "orgId")
                SELECT r."roleId", ${actionId}, r."orgId"
                FROM "roles" r
                WHERE COALESCE(r."isAdmin", false) = false
                  AND NOT EXISTS (
                    SELECT 1 FROM "roleActions" ra
                    WHERE ra."roleId" = r."roleId"
                      AND ra."actionId" = ${actionId}
                      AND ra."orgId" = r."orgId"
                  );
            `);
        }

        await db.execute(sql`COMMIT`);
        console.log(`Finished setup script ${version}`);
    } catch (e) {
        await db.execute(sql`ROLLBACK`);
        console.log("Unable to migrate database");
        console.log(e);
        throw e;
    }
}
