import { db } from "@server/db/pg/driver";
import { sql } from "drizzle-orm";
import { __DIRNAME } from "@server/lib/consts";

const version = "1.14.0";

export default async function migration() {
    console.log(`Running setup script ${version}...`);

    try {
        await db.execute(sql`BEGIN`);

        await db.execute(sql`
            CREATE TABLE "loginPageBranding" (
                "loginPageBrandingId" serial PRIMARY KEY NOT NULL,
                "logoUrl" text NOT NULL,
                "logoWidth" integer NOT NULL,
                "logoHeight" integer NOT NULL,
                "primaryColor" text,
                "resourceTitle" text NOT NULL,
                "resourceSubtitle" text,
                "orgTitle" text,
                "orgSubtitle" text
            );
        `);

        await db.execute(sql`
            CREATE TABLE "loginPageBrandingOrg" (
                "loginPageBrandingId" integer NOT NULL,
                "orgId" varchar NOT NULL
            );
        `);

        await db.execute(sql`
            CREATE TABLE "resourceHeaderAuthExtendedCompatibility" (
                "headerAuthExtendedCompatibilityId" serial PRIMARY KEY NOT NULL,
                "resourceId" integer NOT NULL,
                "extendedCompatibilityIsActivated" boolean DEFAULT false NOT NULL
            );
        `);

        await db.execute(
            sql`ALTER TABLE "resources" ADD COLUMN "maintenanceModeEnabled" boolean DEFAULT false NOT NULL;`
        );

        await db.execute(
            sql`ALTER TABLE "resources" ADD COLUMN "maintenanceModeType" text DEFAULT 'forced';`
        );

        await db.execute(
            sql`ALTER TABLE "resources" ADD COLUMN "maintenanceTitle" text;`
        );

        await db.execute(
            sql`ALTER TABLE "resources" ADD COLUMN "maintenanceMessage" text;`
        );

        await db.execute(
            sql`ALTER TABLE "resources" ADD COLUMN "maintenanceEstimatedTime" text;`
        );

        await db.execute(
            sql`ALTER TABLE "siteResources" ADD COLUMN "tcpPortRangeString" varchar;`
        );

        await db.execute(
            sql`ALTER TABLE "siteResources" ADD COLUMN "udpPortRangeString" varchar;`
        );

        await db.execute(
            sql`ALTER TABLE "siteResources" ADD COLUMN "disableIcmp" boolean DEFAULT false NOT NULL;`
        );

        await db.execute(
            sql`ALTER TABLE "loginPageBrandingOrg" ADD CONSTRAINT "loginPageBrandingOrg_loginPageBrandingId_loginPageBranding_loginPageBrandingId_fk" FOREIGN KEY ("loginPageBrandingId") REFERENCES "public"."loginPageBranding"("loginPageBrandingId") ON DELETE cascade ON UPDATE no action;`
        );

        await db.execute(
            sql`ALTER TABLE "loginPageBrandingOrg" ADD CONSTRAINT "loginPageBrandingOrg_orgId_orgs_orgId_fk" FOREIGN KEY ("orgId") REFERENCES "public"."orgs"("orgId") ON DELETE cascade ON UPDATE no action;`
        );

        await db.execute(
            sql`ALTER TABLE "resourceHeaderAuthExtendedCompatibility" ADD CONSTRAINT "resourceHeaderAuthExtendedCompatibility_resourceId_resources_resourceId_fk" FOREIGN KEY ("resourceId") REFERENCES "public"."resources"("resourceId") ON DELETE cascade ON UPDATE no action;`
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
