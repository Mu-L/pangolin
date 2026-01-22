import { db } from "@server/db/pg/driver";
import { sql } from "drizzle-orm";
import { __DIRNAME } from "@server/lib/consts";

const version = "1.15.0";

export default async function migration() {
    console.log(`Running setup script ${version}...`);

    try {
        await db.execute(sql`BEGIN`);

        await db.execute(sql`
            CREATE TABLE "approvals" (
               	"approvalId" serial PRIMARY KEY NOT NULL,
               	"timestamp" integer NOT NULL,
               	"orgId" varchar NOT NULL,
               	"clientId" integer,
               	"userId" varchar NOT NULL,
               	"decision" varchar DEFAULT 'pending' NOT NULL,
               	"type" varchar NOT NULL
            );
        `);
        await db.execute(sql`
            CREATE TABLE "clientPostureSnapshots" (
               	"snapshotId" serial PRIMARY KEY NOT NULL,
               	"clientId" integer,
               	"collectedAt" integer NOT NULL
            );
        `);
        await db.execute(sql`
            CREATE TABLE "currentFingerprint" (
               	"id" serial PRIMARY KEY NOT NULL,
               	"olmId" text NOT NULL,
               	"firstSeen" integer NOT NULL,
               	"lastSeen" integer NOT NULL,
               	"lastCollectedAt" integer NOT NULL,
               	"username" text,
               	"hostname" text,
               	"platform" text,
               	"osVersion" text,
               	"kernelVersion" text,
               	"arch" text,
               	"deviceModel" text,
               	"serialNumber" text,
               	"platformFingerprint" varchar,
               	"biometricsEnabled" boolean DEFAULT false NOT NULL,
               	"diskEncrypted" boolean DEFAULT false NOT NULL,
               	"firewallEnabled" boolean DEFAULT false NOT NULL,
               	"autoUpdatesEnabled" boolean DEFAULT false NOT NULL,
               	"tpmAvailable" boolean DEFAULT false NOT NULL,
               	"windowsAntivirusEnabled" boolean DEFAULT false NOT NULL,
               	"macosSipEnabled" boolean DEFAULT false NOT NULL,
               	"macosGatekeeperEnabled" boolean DEFAULT false NOT NULL,
               	"macosFirewallStealthMode" boolean DEFAULT false NOT NULL,
               	"linuxAppArmorEnabled" boolean DEFAULT false NOT NULL,
               	"linuxSELinuxEnabled" boolean DEFAULT false NOT NULL
            );
        `);
        await db.execute(sql`
            CREATE TABLE "fingerprintSnapshots" (
               	"id" serial PRIMARY KEY NOT NULL,
               	"fingerprintId" integer,
               	"username" text,
               	"hostname" text,
               	"platform" text,
               	"osVersion" text,
               	"kernelVersion" text,
               	"arch" text,
               	"deviceModel" text,
               	"serialNumber" text,
               	"platformFingerprint" varchar,
               	"biometricsEnabled" boolean DEFAULT false NOT NULL,
               	"diskEncrypted" boolean DEFAULT false NOT NULL,
               	"firewallEnabled" boolean DEFAULT false NOT NULL,
               	"autoUpdatesEnabled" boolean DEFAULT false NOT NULL,
               	"tpmAvailable" boolean DEFAULT false NOT NULL,
               	"windowsAntivirusEnabled" boolean DEFAULT false NOT NULL,
               	"macosSipEnabled" boolean DEFAULT false NOT NULL,
               	"macosGatekeeperEnabled" boolean DEFAULT false NOT NULL,
               	"macosFirewallStealthMode" boolean DEFAULT false NOT NULL,
               	"linuxAppArmorEnabled" boolean DEFAULT false NOT NULL,
               	"linuxSELinuxEnabled" boolean DEFAULT false NOT NULL,
               	"hash" text NOT NULL,
               	"collectedAt" integer NOT NULL
            );
        `);
        await db.execute(
            sql`ALTER TABLE "loginPageBranding" ALTER COLUMN "logoUrl" DROP NOT NULL;`
        );
        await db.execute(
            sql`ALTER TABLE "clients" ADD COLUMN "archived" boolean DEFAULT false NOT NULL;`
        );
        await db.execute(
            sql`ALTER TABLE "clients" ADD COLUMN "blocked" boolean DEFAULT false NOT NULL;`
        );
        await db.execute(
            sql`ALTER TABLE "clients" ADD COLUMN "approvalState" varchar;`
        );
        await db.execute(sql`ALTER TABLE "idp" ADD COLUMN "tags" text;`);
        await db.execute(
            sql`ALTER TABLE "olms" ADD COLUMN "archived" boolean DEFAULT false NOT NULL;`
        );
        await db.execute(
            sql`ALTER TABLE "roles" ADD COLUMN "requireDeviceApproval" boolean DEFAULT false;`
        );
        await db.execute(
            sql`ALTER TABLE "approvals" ADD CONSTRAINT "approvals_orgId_orgs_orgId_fk" FOREIGN KEY ("orgId") REFERENCES "public"."orgs"("orgId") ON DELETE cascade ON UPDATE no action;`
        );
        await db.execute(
            sql`ALTER TABLE "approvals" ADD CONSTRAINT "approvals_clientId_clients_clientId_fk" FOREIGN KEY ("clientId") REFERENCES "public"."clients"("clientId") ON DELETE cascade ON UPDATE no action;`
        );
        await db.execute(
            sql`ALTER TABLE "approvals" ADD CONSTRAINT "approvals_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;`
        );
        await db.execute(
            sql`ALTER TABLE "clientPostureSnapshots" ADD CONSTRAINT "clientPostureSnapshots_clientId_clients_clientId_fk" FOREIGN KEY ("clientId") REFERENCES "public"."clients"("clientId") ON DELETE cascade ON UPDATE no action;`
        );
        await db.execute(
            sql`ALTER TABLE "currentFingerprint" ADD CONSTRAINT "currentFingerprint_olmId_olms_id_fk" FOREIGN KEY ("olmId") REFERENCES "public"."olms"("id") ON DELETE cascade ON UPDATE no action;`
        );
        await db.execute(
            sql`ALTER TABLE "fingerprintSnapshots" ADD CONSTRAINT "fingerprintSnapshots_fingerprintId_currentFingerprint_id_fk" FOREIGN KEY ("fingerprintId") REFERENCES "public"."currentFingerprint"("id") ON DELETE set null ON UPDATE no action;`
        );

        await db.execute(sql`COMMIT`);
        console.log("Migrated database");
    } catch (e) {
        await db.execute(sql`ROLLBACK`);
        console.log("Unable to migrate database");
        console.log(e);
        throw e;
    }

    console.log(`${version} migration complete`);
}
