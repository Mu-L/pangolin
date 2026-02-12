import { __DIRNAME, APP_PATH } from "@server/lib/consts";
import Database from "better-sqlite3";
import path from "path";

const version = "1.15.3";

export default async function migration() {
    console.log(`Running setup script ${version}...`);

    const location = path.join(APP_PATH, "db", "db.sqlite");
    const db = new Database(location);

    try {
        db.transaction(() => {
            db.prepare(`ALTER TABLE 'limits' ADD 'override' integer DEFAULT false;`).run();
            db.prepare(`ALTER TABLE 'subscriptionItems' ADD 'featureId' text;`).run();
            db.prepare(`ALTER TABLE 'subscriptionItems' ADD 'stripeSubscriptionItemId' text;`).run();
            db.prepare(`ALTER TABLE 'subscriptions' ADD 'version' integer;`).run();
            db.prepare(`ALTER TABLE 'subscriptions' ADD 'type' text;`).run();
        })();

        console.log(`Migrated database`);
    } catch (e) {
        console.log("Failed to migrate db:", e);
        throw e;
    }

    console.log(`${version} migration complete`);
}
