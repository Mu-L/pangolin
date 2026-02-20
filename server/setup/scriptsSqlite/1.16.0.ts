import { __DIRNAME, APP_PATH } from "@server/lib/consts";
import Database from "better-sqlite3";
import path from "path";

const version = "1.16.0";

export default async function migration() {
    console.log(`Running setup script ${version}...`);

    const location = path.join(APP_PATH, "db", "db.sqlite");
    const db = new Database(location);

    // set all admin role sudo to "full"; all other roles to "none"
    // all roles set hoemdir to true

    // generate ca certs for all orgs?

    try {
        db.transaction(() => {})();

        console.log(`Migrated database`);
    } catch (e) {
        console.log("Failed to migrate db:", e);
        throw e;
    }

    console.log(`${version} migration complete`);
}
