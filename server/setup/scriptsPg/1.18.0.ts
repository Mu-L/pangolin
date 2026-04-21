import { db } from "@server/db/pg/driver";
import { sql } from "drizzle-orm";

const version = "1.18.0";

export default async function migration() {
    console.log(`Running setup script ${version}...`);

    // Query existing targetHealthCheck data with joined siteId and orgId before
    // the transaction adds the new columns (which start NULL for existing rows).
    // We will delete all rows and reinsert them with targetHealthCheckId = targetId
    // so the two IDs form a stable 1:1 mapping.
    const healthChecksQuery = await db.execute(
        sql`SELECT
                thc."targetHealthCheckId",
                thc."targetId",
                t."siteId",
                s."orgId",
                thc."hcEnabled",
                thc."hcPath",
                thc."hcScheme",
                thc."hcMode",
                thc."hcHostname",
                thc."hcPort",
                thc."hcInterval",
                thc."hcUnhealthyInterval",
                thc."hcTimeout",
                thc."hcHeaders",
                thc."hcFollowRedirects",
                thc."hcMethod",
                thc."hcStatus",
                thc."hcHealth",
                thc."hcTlsServerName"
            FROM "targetHealthCheck" thc
            JOIN "targets" t ON thc."targetId" = t."targetId"
            JOIN "sites" s ON t."siteId" = s."siteId"`
    );
    const existingHealthChecks = healthChecksQuery.rows as {
        targetHealthCheckId: number;
        targetId: number;
        siteId: number;
        orgId: string;
        hcEnabled: boolean;
        hcPath: string | null;
        hcScheme: string | null;
        hcMode: string | null;
        hcHostname: string | null;
        hcPort: number | null;
        hcInterval: number | null;
        hcUnhealthyInterval: number | null;
        hcTimeout: number | null;
        hcHeaders: string | null;
        hcFollowRedirects: boolean | null;
        hcMethod: string | null;
        hcStatus: number | null;
        hcHealth: string | null;
        hcTlsServerName: string | null;
    }[];

    console.log(
        `Found ${existingHealthChecks.length} existing targetHealthCheck row(s) to migrate`
    );

    try {
        await db.execute(sql`BEGIN`);

        await db.execute(sql`
        CREATE TABLE "alertEmailActions" (
           	"emailActionId" serial PRIMARY KEY NOT NULL,
           	"alertRuleId" integer NOT NULL,
           	"enabled" boolean DEFAULT true NOT NULL,
           	"lastSentAt" bigint
        );
        `);

        await db.execute(sql`
        CREATE TABLE "alertEmailRecipients" (
       	"recipientId" serial PRIMARY KEY NOT NULL,
       	"emailActionId" integer NOT NULL,
       	"userId" varchar,
       	"roleId" integer,
       	"email" varchar(255)
        );
        `);

        await db.execute(sql`
        CREATE TABLE "alertHealthChecks" (
           	"alertRuleId" integer NOT NULL,
           	"healthCheckId" integer NOT NULL
        );
        `);

        await db.execute(sql`
        CREATE TABLE "alertResources" (
           	"alertRuleId" integer NOT NULL,
           	"resourceId" integer NOT NULL
        );
        `);

        await db.execute(sql`
        CREATE TABLE "alertRules" (
           	"alertRuleId" serial PRIMARY KEY NOT NULL,
           	"orgId" varchar(255) NOT NULL,
           	"name" varchar(255) NOT NULL,
           	"eventType" varchar(100) NOT NULL,
           	"enabled" boolean DEFAULT true NOT NULL,
           	"cooldownSeconds" integer DEFAULT 300 NOT NULL,
           	"allSites" boolean DEFAULT false NOT NULL,
           	"allHealthChecks" boolean DEFAULT false NOT NULL,
           	"allResources" boolean DEFAULT false NOT NULL,
           	"lastTriggeredAt" bigint,
           	"createdAt" bigint NOT NULL,
           	"updatedAt" bigint NOT NULL
        );
        `);

        await db.execute(sql`
        CREATE TABLE "alertSites" (
           	"alertRuleId" integer NOT NULL,
           	"siteId" integer NOT NULL
        );
        `);

        await db.execute(sql`
        CREATE TABLE "alertWebhookActions" (
           	"webhookActionId" serial PRIMARY KEY NOT NULL,
           	"alertRuleId" integer NOT NULL,
           	"webhookUrl" text NOT NULL,
           	"config" text,
           	"enabled" boolean DEFAULT true NOT NULL,
           	"lastSentAt" bigint
        );
        `);

        await db.execute(sql`
        CREATE TABLE "networks" (
           	"networkId" serial PRIMARY KEY NOT NULL,
           	"niceId" text,
           	"name" text,
           	"scope" varchar DEFAULT 'global' NOT NULL,
           	"orgId" varchar NOT NULL
        );
        `);

        await db.execute(sql`
        CREATE TABLE "siteNetworks" (
           	"siteId" integer NOT NULL,
           	"networkId" integer NOT NULL
        );
        `);

        await db.execute(sql`
        CREATE TABLE "statusHistory" (
           	"id" serial PRIMARY KEY NOT NULL,
           	"entityType" varchar NOT NULL,
           	"entityId" integer NOT NULL,
           	"orgId" varchar NOT NULL,
           	"status" varchar NOT NULL,
           	"timestamp" integer NOT NULL
        );
        `);

        await db.execute(sql`
        ALTER TABLE "siteResources" DROP CONSTRAINT "siteResources_siteId_sites_siteId_fk";
        `);

        await db.execute(sql`
        ALTER TABLE "targetHealthCheck" ALTER COLUMN "targetId" DROP NOT NULL;
        `);

        await db.execute(sql`
        ALTER TABLE "subscriptions" ADD COLUMN "expiresAt" bigint;
        `);

        await db.execute(sql`
        ALTER TABLE "subscriptions" ADD COLUMN "trial" boolean DEFAULT false;
        `);

        await db.execute(sql`
        ALTER TABLE "requestAuditLog" ADD COLUMN "siteResourceId" integer;
        `);

        await db.execute(sql`
        ALTER TABLE "siteResources" ADD COLUMN "networkId" integer;
        `);

        await db.execute(sql`
        ALTER TABLE "siteResources" ADD COLUMN "defaultNetworkId" integer;
        `);

        await db.execute(sql`
        ALTER TABLE "siteResources" ADD COLUMN "ssl" boolean DEFAULT false NOT NULL;
        `);

        await db.execute(sql`
        ALTER TABLE "siteResources" ADD COLUMN "scheme" varchar;
        `);

        await db.execute(sql`
        ALTER TABLE "siteResources" ADD COLUMN "domainId" varchar;
        `);

        await db.execute(sql`
        ALTER TABLE "siteResources" ADD COLUMN "subdomain" varchar;
        `);

        await db.execute(sql`
        ALTER TABLE "siteResources" ADD COLUMN "fullDomain" varchar;
        `);

        // Add orgId and siteId as nullable first; NOT NULL constraints are applied
        // after the data migration below once every row has been populated.
        await db.execute(sql`
        ALTER TABLE "targetHealthCheck" ADD COLUMN "orgId" varchar;
        `);

        await db.execute(sql`
        ALTER TABLE "targetHealthCheck" ADD COLUMN "siteId" integer;
        `);

        await db.execute(sql`
        ALTER TABLE "targetHealthCheck" ADD COLUMN "name" varchar;
        `);

        await db.execute(sql`
        ALTER TABLE "targetHealthCheck" ADD COLUMN "hcHealthyThreshold" integer DEFAULT 1;
        `);

        await db.execute(sql`
        ALTER TABLE "targetHealthCheck" ADD COLUMN "hcUnhealthyThreshold" integer DEFAULT 1;
        `);

        await db.execute(sql`
        ALTER TABLE "alertEmailActions" ADD CONSTRAINT "alertEmailActions_alertRuleId_alertRules_alertRuleId_fk" FOREIGN KEY ("alertRuleId") REFERENCES "public"."alertRules"("alertRuleId") ON DELETE cascade ON UPDATE no action;
        `);

        await db.execute(sql`
        ALTER TABLE "alertEmailRecipients" ADD CONSTRAINT "alertEmailRecipients_emailActionId_alertEmailActions_emailActionId_fk" FOREIGN KEY ("emailActionId") REFERENCES "public"."alertEmailActions"("emailActionId") ON DELETE cascade ON UPDATE no action;
        `);

        await db.execute(sql`
        ALTER TABLE "alertEmailRecipients" ADD CONSTRAINT "alertEmailRecipients_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
        `);

        await db.execute(sql`
        ALTER TABLE "alertEmailRecipients" ADD CONSTRAINT "alertEmailRecipients_roleId_roles_roleId_fk" FOREIGN KEY ("roleId") REFERENCES "public"."roles"("roleId") ON DELETE cascade ON UPDATE no action;
        `);

        await db.execute(sql`
        ALTER TABLE "alertHealthChecks" ADD CONSTRAINT "alertHealthChecks_alertRuleId_alertRules_alertRuleId_fk" FOREIGN KEY ("alertRuleId") REFERENCES "public"."alertRules"("alertRuleId") ON DELETE cascade ON UPDATE no action;
        `);

        await db.execute(sql`
        ALTER TABLE "alertHealthChecks" ADD CONSTRAINT "alertHealthChecks_healthCheckId_targetHealthCheck_targetHealthCheckId_fk" FOREIGN KEY ("healthCheckId") REFERENCES "public"."targetHealthCheck"("targetHealthCheckId") ON DELETE cascade ON UPDATE no action;
        `);

        await db.execute(sql`
        ALTER TABLE "alertResources" ADD CONSTRAINT "alertResources_alertRuleId_alertRules_alertRuleId_fk" FOREIGN KEY ("alertRuleId") REFERENCES "public"."alertRules"("alertRuleId") ON DELETE cascade ON UPDATE no action;
        `);

        await db.execute(sql`
        ALTER TABLE "alertResources" ADD CONSTRAINT "alertResources_resourceId_resources_resourceId_fk" FOREIGN KEY ("resourceId") REFERENCES "public"."resources"("resourceId") ON DELETE cascade ON UPDATE no action;
        `);

        await db.execute(sql`
        ALTER TABLE "alertRules" ADD CONSTRAINT "alertRules_orgId_orgs_orgId_fk" FOREIGN KEY ("orgId") REFERENCES "public"."orgs"("orgId") ON DELETE cascade ON UPDATE no action;
        `);

        await db.execute(sql`
        ALTER TABLE "alertSites" ADD CONSTRAINT "alertSites_alertRuleId_alertRules_alertRuleId_fk" FOREIGN KEY ("alertRuleId") REFERENCES "public"."alertRules"("alertRuleId") ON DELETE cascade ON UPDATE no action;
        `);

        await db.execute(sql`
        ALTER TABLE "alertSites" ADD CONSTRAINT "alertSites_siteId_sites_siteId_fk" FOREIGN KEY ("siteId") REFERENCES "public"."sites"("siteId") ON DELETE cascade ON UPDATE no action;
        `);

        await db.execute(sql`
        ALTER TABLE "alertWebhookActions" ADD CONSTRAINT "alertWebhookActions_alertRuleId_alertRules_alertRuleId_fk" FOREIGN KEY ("alertRuleId") REFERENCES "public"."alertRules"("alertRuleId") ON DELETE cascade ON UPDATE no action;
        `);

        await db.execute(sql`
        ALTER TABLE "networks" ADD CONSTRAINT "networks_orgId_orgs_orgId_fk" FOREIGN KEY ("orgId") REFERENCES "public"."orgs"("orgId") ON DELETE cascade ON UPDATE no action;
        `);

        await db.execute(sql`
        ALTER TABLE "siteNetworks" ADD CONSTRAINT "siteNetworks_siteId_sites_siteId_fk" FOREIGN KEY ("siteId") REFERENCES "public"."sites"("siteId") ON DELETE cascade ON UPDATE no action;
        `);

        await db.execute(sql`
        ALTER TABLE "siteNetworks" ADD CONSTRAINT "siteNetworks_networkId_networks_networkId_fk" FOREIGN KEY ("networkId") REFERENCES "public"."networks"("networkId") ON DELETE cascade ON UPDATE no action;
        `);

        await db.execute(sql`
        ALTER TABLE "statusHistory" ADD CONSTRAINT "statusHistory_orgId_orgs_orgId_fk" FOREIGN KEY ("orgId") REFERENCES "public"."orgs"("orgId") ON DELETE cascade ON UPDATE no action;
        `);

        await db.execute(sql`
        CREATE INDEX "idx_statusHistory_entity" ON "statusHistory" USING btree ("entityType","entityId","timestamp");
        `);

        await db.execute(sql`
        CREATE INDEX "idx_statusHistory_org_timestamp" ON "statusHistory" USING btree ("orgId","timestamp");
        `);

        await db.execute(sql`
        ALTER TABLE "siteResources" ADD CONSTRAINT "siteResources_networkId_networks_networkId_fk" FOREIGN KEY ("networkId") REFERENCES "public"."networks"("networkId") ON DELETE set null ON UPDATE no action;
        `);

        await db.execute(sql`
        ALTER TABLE "siteResources" ADD CONSTRAINT "siteResources_defaultNetworkId_networks_networkId_fk" FOREIGN KEY ("defaultNetworkId") REFERENCES "public"."networks"("networkId") ON DELETE restrict ON UPDATE no action;
        `);

        await db.execute(sql`
        ALTER TABLE "siteResources" ADD CONSTRAINT "siteResources_domainId_domains_domainId_fk" FOREIGN KEY ("domainId") REFERENCES "public"."domains"("domainId") ON DELETE set null ON UPDATE no action;
        `);

        await db.execute(sql`
        ALTER TABLE "targetHealthCheck" ADD CONSTRAINT "targetHealthCheck_orgId_orgs_orgId_fk" FOREIGN KEY ("orgId") REFERENCES "public"."orgs"("orgId") ON DELETE cascade ON UPDATE no action;
        `);

        await db.execute(sql`
        ALTER TABLE "targetHealthCheck" ADD CONSTRAINT "targetHealthCheck_siteId_sites_siteId_fk" FOREIGN KEY ("siteId") REFERENCES "public"."sites"("siteId") ON DELETE cascade ON UPDATE no action;
        `);

        await db.execute(sql`
        ALTER TABLE "siteResources" DROP COLUMN "siteId";
        `);

        await db.execute(sql`
        ALTER TABLE "siteResources" DROP COLUMN "protocol";
        `);

        await db.execute(sql`COMMIT`);
        console.log("Migrated database");
    } catch (e) {
        await db.execute(sql`ROLLBACK`);
        console.log("Unable to migrate database");
        console.log(e);
        throw e;
    }

    // Reinsert targetHealthCheck rows with corrected IDs:
    // targetHealthCheckId is set to the same integer as targetId (1:1 mapping),
    // siteId and orgId are populated from the associated target and site.
    //
    // Because targetHealthCheckId is a serial (sequence-backed) column, inserting
    // explicit values is allowed in PostgreSQL — the sequence is simply bypassed.
    // After all inserts we advance the sequence to MAX(targetHealthCheckId) via
    // setval() so future auto-inserts never collide with the explicit IDs we used.
    if (existingHealthChecks.length > 0) {
        try {
            // Remove all existing rows first. The alertHealthChecks table is brand
            // new in this migration so there are no FK references to worry about.
            await db.execute(sql`DELETE FROM "targetHealthCheck"`);

            for (const hc of existingHealthChecks) {
                await db.execute(sql`
                    INSERT INTO "targetHealthCheck" (
                        "targetHealthCheckId",
                        "targetId",
                        "orgId",
                        "siteId",
                        "hcEnabled",
                        "hcPath",
                        "hcScheme",
                        "hcMode",
                        "hcHostname",
                        "hcPort",
                        "hcInterval",
                        "hcUnhealthyInterval",
                        "hcTimeout",
                        "hcHeaders",
                        "hcFollowRedirects",
                        "hcMethod",
                        "hcStatus",
                        "hcHealth",
                        "hcTlsServerName"
                    ) VALUES (
                        ${hc.targetId},
                        ${hc.targetId},
                        ${hc.orgId},
                        ${hc.siteId},
                        ${hc.hcEnabled},
                        ${hc.hcPath},
                        ${hc.hcScheme},
                        ${hc.hcMode},
                        ${hc.hcHostname},
                        ${hc.hcPort},
                        ${hc.hcInterval},
                        ${hc.hcUnhealthyInterval},
                        ${hc.hcTimeout},
                        ${hc.hcHeaders},
                        ${hc.hcFollowRedirects},
                        ${hc.hcMethod},
                        ${hc.hcStatus},
                        ${hc.hcHealth},
                        ${hc.hcTlsServerName}
                    )
                `);
            }

            // Now that every row has orgId and siteId populated, enforce NOT NULL.
            await db.execute(
                sql`ALTER TABLE "targetHealthCheck" ALTER COLUMN "orgId" SET NOT NULL`
            );
            await db.execute(
                sql`ALTER TABLE "targetHealthCheck" ALTER COLUMN "siteId" SET NOT NULL`
            );

            // Advance the sequence so the next auto-insert picks up after the
            // largest ID we explicitly wrote. setval(..., max, true) means the
            // next nextval() call will return max + 1.
            await db.execute(sql`
                SELECT setval(
                    pg_get_serial_sequence('"targetHealthCheck"', 'targetHealthCheckId'),
                    (SELECT MAX("targetHealthCheckId") FROM "targetHealthCheck"),
                    true
                )
            `);

            console.log(
                `Migrated ${existingHealthChecks.length} targetHealthCheck row(s) with corrected IDs`
            );
        } catch (e) {
            console.error(
                "Error while migrating targetHealthCheck rows:",
                e
            );
            throw e;
        }
    }

    console.log(`${version} migration complete`);
}
