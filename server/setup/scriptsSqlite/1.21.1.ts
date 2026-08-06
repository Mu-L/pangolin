import { APP_PATH } from "@server/lib/consts";
import Database from "better-sqlite3";
import path from "path";

const version = "1.21.1";

const actionsToGrant = ["getSiteResource", "listSiteResources"] as const;

export default async function migration() {
    console.log(`Running setup script ${version}...`);

    const location = path.join(APP_PATH, "db", "db.sqlite");
    const db = new Database(location);

    try {
        db.transaction(() => {
            const insertRoleAction = db.prepare(`
                INSERT INTO 'roleActions' ("roleId", "actionId", "orgId")
                SELECT r."roleId", ?, r."orgId"
                FROM 'roles' r
                WHERE COALESCE(r."isAdmin", 0) = 0
                  AND NOT EXISTS (
                    SELECT 1 FROM 'roleActions' ra
                    WHERE ra."roleId" = r."roleId"
                      AND ra."actionId" = ?
                      AND ra."orgId" = r."orgId"
                  );
            `);

            for (const actionId of actionsToGrant) {
                insertRoleAction.run(actionId, actionId);
            }
        })();

        console.log(`Finished setup script ${version}`);
    } catch (e) {
        console.log("Unable to migrate database");
        console.log(e);
        throw e;
    } finally {
        db.close();
    }
}
