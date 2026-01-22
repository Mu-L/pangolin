import { __DIRNAME, APP_PATH } from "@server/lib/consts";
import Database from "better-sqlite3";
import path from "path";

const version = "1.15.0";

export default async function migration() {
    console.log(`Running setup script ${version}...`);

    const location = path.join(APP_PATH, "db", "db.sqlite");
    const db = new Database(location);

    try {
        db.pragma("foreign_keys = OFF");

        db.transaction(() => {
            db.prepare(
                `
CREATE TABLE 'approvals' (
	'approvalId' integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	'timestamp' integer NOT NULL,
	'orgId' text NOT NULL,
	'clientId' integer,
	'userId' text,
	'decision' text DEFAULT 'pending' NOT NULL,
	'type' text NOT NULL,
	FOREIGN KEY ('orgId') REFERENCES 'orgs'('orgId') ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ('clientId') REFERENCES 'clients'('clientId') ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ('userId') REFERENCES 'user'('id') ON UPDATE no action ON DELETE cascade
);
        `
            ).run();

            db.prepare(
                `
CREATE TABLE 'currentFingerprint' (
	'id' integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	'olmId' text NOT NULL,
	'firstSeen' integer NOT NULL,
	'lastSeen' integer NOT NULL,
	'lastCollectedAt' integer NOT NULL,
	'username' text,
	'hostname' text,
	'platform' text,
	'osVersion' text,
	'kernelVersion' text,
	'arch' text,
	'deviceModel' text,
	'serialNumber' text,
	'platformFingerprint' text,
	'biometricsEnabled' integer DEFAULT false NOT NULL,
	'diskEncrypted' integer DEFAULT false NOT NULL,
	'firewallEnabled' integer DEFAULT false NOT NULL,
	'autoUpdatesEnabled' integer DEFAULT false NOT NULL,
	'tpmAvailable' integer DEFAULT false NOT NULL,
	'windowsAntivirusEnabled' integer DEFAULT false NOT NULL,
	'macosSipEnabled' integer DEFAULT false NOT NULL,
	'macosGatekeeperEnabled' integer DEFAULT false NOT NULL,
	'macosFirewallStealthMode' integer DEFAULT false NOT NULL,
	'linuxAppArmorEnabled' integer DEFAULT false NOT NULL,
	'linuxSELinuxEnabled' integer DEFAULT false NOT NULL,
	FOREIGN KEY ('olmId') REFERENCES 'olms'('id') ON UPDATE no action ON DELETE cascade
);
        `
            ).run();

            db.prepare(
                `
CREATE TABLE 'fingerprintSnapshots' (
	'id' integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	'fingerprintId' integer,
	'username' text,
	'hostname' text,
	'platform' text,
	'osVersion' text,
	'kernelVersion' text,
	'arch' text,
	'deviceModel' text,
	'serialNumber' text,
	'platformFingerprint' text,
	'biometricsEnabled' integer DEFAULT false NOT NULL,
	'diskEncrypted' integer DEFAULT false NOT NULL,
	'firewallEnabled' integer DEFAULT false NOT NULL,
	'autoUpdatesEnabled' integer DEFAULT false NOT NULL,
	'tpmAvailable' integer DEFAULT false NOT NULL,
	'windowsAntivirusEnabled' integer DEFAULT false NOT NULL,
	'macosSipEnabled' integer DEFAULT false NOT NULL,
	'macosGatekeeperEnabled' integer DEFAULT false NOT NULL,
	'macosFirewallStealthMode' integer DEFAULT false NOT NULL,
	'linuxAppArmorEnabled' integer DEFAULT false NOT NULL,
	'linuxSELinuxEnabled' integer DEFAULT false NOT NULL,
	'hash' text NOT NULL,
	'collectedAt' integer NOT NULL,
	FOREIGN KEY ('fingerprintId') REFERENCES 'currentFingerprint'('id') ON UPDATE no action ON DELETE set null
);
        `
            ).run();

            db.prepare(
                `
CREATE TABLE '__new_loginPageBranding' (
	'loginPageBrandingId' integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	'logoUrl' text,
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
                `INSERT INTO '__new_loginPageBranding'("loginPageBrandingId", "logoUrl", "logoWidth", "logoHeight", "primaryColor", "resourceTitle", "resourceSubtitle", "orgTitle", "orgSubtitle") SELECT "loginPageBrandingId", "logoUrl", "logoWidth", "logoHeight", "primaryColor", "resourceTitle", "resourceSubtitle", "orgTitle", "orgSubtitle" FROM 'loginPageBranding';`
            ).run();

            db.prepare(`DROP TABLE 'loginPageBranding';`).run();

            db.prepare(
                `ALTER TABLE '__new_loginPageBranding' RENAME TO 'loginPageBranding';`
            ).run();

            db.prepare(
                `ALTER TABLE 'clients' ADD 'archived' integer DEFAULT false NOT NULL;`
            ).run();

            db.prepare(
                `ALTER TABLE 'clients' ADD 'blocked' integer DEFAULT false NOT NULL;`
            ).run();

            db.prepare(`ALTER TABLE 'clients' ADD 'approvalState' text;`).run();

            db.prepare(`ALTER TABLE 'idp' ADD 'tags' text;`).run();

            db.prepare(
                `ALTER TABLE 'olms' ADD 'archived' integer DEFAULT false NOT NULL;`
            ).run();

            db.prepare(
                `ALTER TABLE 'roles' ADD 'requireDeviceApproval' integer DEFAULT false;`
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
