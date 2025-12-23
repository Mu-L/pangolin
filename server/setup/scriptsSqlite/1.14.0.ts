import { __DIRNAME, APP_PATH } from "@server/lib/consts";
import Database from "better-sqlite3";
import path from "path";

const version = "1.14.0";

export default async function migration() {
    console.log(`Running setup script ${version}...`);

    const location = path.join(APP_PATH, "db", "db.sqlite");
    const db = new Database(location);

    try {
        db.pragma("foreign_keys = OFF");

        db.transaction(() => {
            db.prepare(
                `
        CREATE TABLE 'loginPageBranding' (
            'loginPageBrandingId' integer PRIMARY KEY AUTOINCREMENT NOT NULL,
            'logoUrl' text NOT NULL,
            'logoWidth' integer NOT NULL,
            'logoHeight' integer NOT NULL,
            'primaryColor' text,
            'resourceTitle' text NOT NULL,
            'resourceSubtitle' text,
            'orgTitle' text,
            'orgSubtitle' text
        );
        `
            ).run();

            db.prepare(
                `
        CREATE TABLE 'loginPageBrandingOrg' (
            'loginPageBrandingId' integer NOT NULL,
            'orgId' text NOT NULL,
            FOREIGN KEY ('loginPageBrandingId') REFERENCES 'loginPageBranding'('loginPageBrandingId') ON UPDATE no action ON DELETE cascade,
            FOREIGN KEY ('orgId') REFERENCES 'orgs'('orgId') ON UPDATE no action ON DELETE cascade
        );
        `
            ).run();

            db.prepare(
                `
        CREATE TABLE 'resourceHeaderAuthExtendedCompatibility' (
            'headerAuthExtendedCompatibilityId' integer PRIMARY KEY AUTOINCREMENT NOT NULL,
            'resourceId' integer NOT NULL,
            'extendedCompatibilityIsActivated' integer NOT NULL,
            FOREIGN KEY ('resourceId') REFERENCES 'resources'('resourceId') ON UPDATE no action ON DELETE cascade
        );
        `
            ).run();

            db.prepare(
                `ALTER TABLE 'resources' ADD 'maintenanceModeEnabled' integer DEFAULT false NOT NULL;`
            ).run();

            db.prepare(
                `ALTER TABLE 'resources' ADD 'maintenanceModeType' text DEFAULT 'forced';`
            ).run();

            db.prepare(
                `ALTER TABLE 'resources' ADD 'maintenanceTitle' text;`
            ).run();

            db.prepare(
                `ALTER TABLE 'resources' ADD 'maintenanceMessage' text;`
            ).run();

            db.prepare(
                `ALTER TABLE 'resources' ADD 'maintenanceEstimatedTime' text;`
            ).run();

            db.prepare(
                `ALTER TABLE 'siteResources' ADD 'tcpPortRangeString' text;`
            ).run();

            db.prepare(
                `ALTER TABLE 'siteResources' ADD 'udpPortRangeString' text;`
            ).run();

            db.prepare(
                `ALTER TABLE 'siteResources' ADD 'disableIcmp' integer;`
            ).run();
        })();

        db.pragma("foreign_keys = ON");

        console.log(`Migrated database`);
    } catch (e) {
        console.log("Failed to migrate db:", e);
        throw e;
    }

    console.log(`${version} migration complete`);
}
