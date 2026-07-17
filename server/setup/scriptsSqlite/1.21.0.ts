import { APP_PATH } from "@server/lib/consts";
import Database from "better-sqlite3";
import path from "path";

const version = "1.21.0";

export default async function migration() {
    console.log(`Running setup script ${version}...`);

    const location = path.join(APP_PATH, "db", "db.sqlite");
    const db = new Database(location);

    try {
        db.pragma("foreign_keys = OFF");

        db.transaction(() => {
            db.prepare(
                `
            ALTER TABLE 'resourceAccessToken' ADD 'userId' text REFERENCES user(id);
                `
            ).run();

            db.prepare(
                `
            ALTER TABLE 'resourceAccessToken' ADD 'persistSession' integer DEFAULT false NOT NULL;
                `
            ).run();

            db.prepare(
                `
            ALTER TABLE 'resources' ADD 'status' text DEFAULT 'approved';
                `
            ).run();

            db.prepare(
                `
            ALTER TABLE 'siteResources' ADD 'status' text DEFAULT 'approved';
                `
            ).run();

            db.prepare(
                `
            ALTER TABLE 'sites' ADD 'localEndpoints' text;
                `
            ).run();
        })();

        db.pragma("foreign_keys = ON");

        console.log("Migrated database");
    } catch (e) {
        console.log("Failed to migrate db:", e);
        throw e;
    }

    console.log(`${version} migration complete`);
}
