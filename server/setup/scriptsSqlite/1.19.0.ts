import { APP_PATH } from "@server/lib/consts";
import Database from "better-sqlite3";
import z from "zod";
import { fromZodError } from "zod-validation-error";
import fs from "fs";
import yaml from "js-yaml";
import path from "path";

const version = "1.19.0";

export default async function migration() {
    console.log(`Running setup script ${version}...`);

    const location = path.join(APP_PATH, "db", "db.sqlite");
    const db = new Database(location);

    try {
        db.transaction(() => {
            db.prepare(
                `
            CREATE TABLE 'browserGatewayTarget' (
                'browserGatewayTargetId' integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                'resourceId' integer NOT NULL,
                'siteId' integer NOT NULL,
                'authToken' text NOT NULL,
                'type' text NOT NULL,
                'destination' text NOT NULL,
                'destinationPort' integer NOT NULL,
                FOREIGN KEY ('resourceId') REFERENCES 'resources'('resourceId') ON UPDATE no action ON DELETE cascade,
                FOREIGN KEY ('siteId') REFERENCES 'sites'('siteId') ON UPDATE no action ON DELETE cascade
            );
                `
            ).run();

            db.prepare(
                `
            CREATE TABLE 'clientLabels' (
                'clientLabelId' integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                'clientId' integer NOT NULL,
                'labelId' integer NOT NULL,
                FOREIGN KEY ('clientId') REFERENCES 'clients'('clientId') ON UPDATE no action ON DELETE cascade,
                FOREIGN KEY ('labelId') REFERENCES 'labels'('labelId') ON UPDATE no action ON DELETE cascade
            );
                `
            ).run();

            db.prepare(
                `
            CREATE UNIQUE INDEX 'client_label_uniq' ON 'clientLabels' ('clientId','labelId');
                `
            ).run();
            db.prepare(
                `
            CREATE TABLE 'labels' (
                'labelId' integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                'name' text NOT NULL,
                'color' text NOT NULL,
                'orgId' text NOT NULL,
                FOREIGN KEY ('orgId') REFERENCES 'orgs'('orgId') ON UPDATE no action ON DELETE cascade
            );
                `
            ).run();

            db.prepare(
                `
            CREATE TABLE 'resourceLabels' (
                'resourceLabelId' integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                'resourceId' integer NOT NULL,
                'labelId' integer NOT NULL,
                FOREIGN KEY ('resourceId') REFERENCES 'resources'('resourceId') ON UPDATE no action ON DELETE cascade,
                FOREIGN KEY ('labelId') REFERENCES 'labels'('labelId') ON UPDATE no action ON DELETE cascade
            );
                `
            ).run();

            db.prepare(
                `
            CREATE UNIQUE INDEX 'resource_label_uniq' ON 'resourceLabels' ('resourceId','labelId');
                `
            ).run();
            db.prepare(
                `
            CREATE TABLE 'resourcePolicies' (
                'resourcePolicyId' integer PRIMARY KEY NOT NULL,
                'sso' integer DEFAULT true NOT NULL,
                'applyRules' integer DEFAULT false NOT NULL,
                'scope' text DEFAULT 'global' NOT NULL,
                'emailWhitelistEnabled' integer DEFAULT false NOT NULL,
                'niceId' text NOT NULL,
                'idpId' integer,
                'name' text NOT NULL,
                'orgId' text NOT NULL,
                FOREIGN KEY ('idpId') REFERENCES 'idp'('idpId') ON UPDATE no action ON DELETE set null,
                FOREIGN KEY ('orgId') REFERENCES 'orgs'('orgId') ON UPDATE no action ON DELETE cascade
            );
                `
            ).run();

            db.prepare(
                `
            CREATE TABLE 'resourcePolicyHeaderAuth' (
                'headerAuthId' integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                'headerAuthHash' text NOT NULL,
                'extendedCompatibility' integer DEFAULT true NOT NULL,
                'resourcePolicyId' integer NOT NULL,
                FOREIGN KEY ('resourcePolicyId') REFERENCES 'resourcePolicies'('resourcePolicyId') ON UPDATE no action ON DELETE cascade
            );
                `
            ).run();

            db.prepare(
                `
            CREATE TABLE 'resourcePolicyPassword' (
                'passwordId' integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                'passwordHash' text NOT NULL,
                'resourcePolicyId' integer NOT NULL,
                FOREIGN KEY ('resourcePolicyId') REFERENCES 'resourcePolicies'('resourcePolicyId') ON UPDATE no action ON DELETE cascade
            );
                `
            ).run();

            db.prepare(
                `
            CREATE TABLE 'resourcePolicyPincode' (
                'pincodeId' integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                'pincodeHash' text NOT NULL,
                'digitLength' integer NOT NULL,
                'resourcePolicyId' integer NOT NULL,
                FOREIGN KEY ('resourcePolicyId') REFERENCES 'resourcePolicies'('resourcePolicyId') ON UPDATE no action ON DELETE cascade
            );
                `
            ).run();

            db.prepare(
                `
            CREATE TABLE 'resourcePolicyRules' (
                'ruleId' integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                'resourcePolicyId' integer NOT NULL,
                'enabled' integer DEFAULT true NOT NULL,
                'priority' integer NOT NULL,
                'action' text NOT NULL,
                'match' text NOT NULL,
                'value' text NOT NULL,
                FOREIGN KEY ('resourcePolicyId') REFERENCES 'resourcePolicies'('resourcePolicyId') ON UPDATE no action ON DELETE cascade
            );
                `
            ).run();

            db.prepare(
                `
            CREATE TABLE 'resourcePolicyWhitelist' (
                'id' integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                'email' text NOT NULL,
                'resourcePolicyId' integer NOT NULL,
                FOREIGN KEY ('resourcePolicyId') REFERENCES 'resourcePolicies'('resourcePolicyId') ON UPDATE no action ON DELETE cascade
            );
                `
            ).run();

            db.prepare(
                `
            CREATE TABLE 'rolePolicies' (
                'roleId' integer NOT NULL,
                'resourcePolicyId' integer NOT NULL,
                FOREIGN KEY ('roleId') REFERENCES 'roles'('roleId') ON UPDATE no action ON DELETE cascade,
                FOREIGN KEY ('resourcePolicyId') REFERENCES 'resourcePolicies'('resourcePolicyId') ON UPDATE no action ON DELETE cascade
            );
                `
            ).run();

            db.prepare(
                `
            CREATE TABLE 'siteLabels' (
                'siteLabelId' integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                'siteId' integer NOT NULL,
                'labelId' integer NOT NULL,
                FOREIGN KEY ('siteId') REFERENCES 'sites'('siteId') ON UPDATE no action ON DELETE cascade,
                FOREIGN KEY ('labelId') REFERENCES 'labels'('labelId') ON UPDATE no action ON DELETE cascade
            );
                `
            ).run();

            db.prepare(
                `
            CREATE UNIQUE INDEX 'site_label_uniq' ON 'siteLabels' ('siteId','labelId');
                `
            ).run();
            db.prepare(
                `
            CREATE TABLE 'siteResourceLabels' (
                'siteResourceLabelId' integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                'siteResourceId' integer NOT NULL,
                'labelId' integer NOT NULL,
                FOREIGN KEY ('siteResourceId') REFERENCES 'siteResources'('siteResourceId') ON UPDATE no action ON DELETE cascade,
                FOREIGN KEY ('labelId') REFERENCES 'labels'('labelId') ON UPDATE no action ON DELETE cascade
            );
                `
            ).run();

            db.prepare(
                `
            CREATE UNIQUE INDEX 'site_resource_label_uniq' ON 'siteResourceLabels' ('siteResourceId','labelId');
                `
            ).run();
            db.prepare(
                `
            CREATE TABLE 'userPolicies' (
                'userId' text NOT NULL,
                'resourcePolicyId' integer NOT NULL,
                FOREIGN KEY ('userId') REFERENCES 'user'('id') ON UPDATE no action ON DELETE cascade,
                FOREIGN KEY ('resourcePolicyId') REFERENCES 'resourcePolicies'('resourcePolicyId') ON UPDATE no action ON DELETE cascade
            );
                `
            ).run();

            db.prepare(
                `
            ALTER TABLE 'siteResources' ADD COLUMN 'destination2' text;
                `
            ).run();
            db.prepare(
                `
            UPDATE 'siteResources' SET 'destination2' = 'destination';
                `
            ).run();
            db.prepare(
                `
            ALTER TABLE 'siteResources' DROP COLUMN 'destination';
                `
            ).run();
            db.prepare(
                `
            ALTER TABLE 'siteResources' RENAME COLUMN 'destination2' TO 'destination';
                `
            ).run();
            db.prepare(
                `

            ALTER TABLE 'siteResources' ADD COLUMN 'pamMode' text DEFAULT 'passthrough';
                `
            ).run();
            db.prepare(
                `

            ALTER TABLE 'orgs' ADD 'settingsEnableGlobalNewtAutoUpdate' integer DEFAULT false NOT NULL;
                `
            ).run();
            db.prepare(
                `
            ALTER TABLE 'resourceAccessToken' ADD 'path' text;
                `
            ).run();
            db.prepare(
                `
            ALTER TABLE 'resources' ADD 'resourcePolicyId' integer REFERENCES resourcePolicies(resourcePolicyId);
                `
            ).run();
            db.prepare(
                `
            ALTER TABLE 'resources' ADD 'defaultResourcePolicyId' integer REFERENCES resourcePolicies(resourcePolicyId);
                `
            ).run();
            db.prepare(
                `
            ALTER TABLE 'resources' ADD 'mode' text DEFAULT 'http' NOT NULL;
                `
            ).run();
            db.prepare(
                `
            UPDATE 'resources'
            SET "mode" = CASE
                WHEN COALESCE("http", 1) = 1 THEN 'http'
                WHEN COALESCE("http", 0) = 0 AND LOWER(COALESCE("protocol", '')) = 'tcp' THEN 'tcp'
                WHEN COALESCE("http", 0) = 0 AND LOWER(COALESCE("protocol", '')) = 'udp' THEN 'udp'
                ELSE 'http'
            END;
                `
            ).run();
            db.prepare(
                `
            ALTER TABLE 'resources' ADD 'pamMode' text DEFAULT 'passthrough';
                `
            ).run();
            db.prepare(
                `
            ALTER TABLE 'resources' ADD 'authDaemonMode' text DEFAULT 'site';
                `
            ).run();
            db.prepare(
                `
            ALTER TABLE 'resources' ADD 'authDaemonPort' integer DEFAULT 22123;
                `
            ).run();
            db.prepare(
                `
            ALTER TABLE 'resources' DROP COLUMN 'http';
                `
            ).run();
            db.prepare(
                `
            ALTER TABLE 'resources' DROP COLUMN 'protocol';
                `
            ).run();
            db.prepare(
                `
            ALTER TABLE 'sites' ADD 'autoUpdateEnabled' integer DEFAULT false NOT NULL;
                `
            ).run();
            db.prepare(
                `
            ALTER TABLE 'sites' ADD 'autoUpdateOverrideOrg' integer DEFAULT false NOT NULL;
                `
            ).run();
        })();

        console.log("Migrated database");
    } catch (e) {
        console.log("Failed to migrate db:", e);
        throw e;
    }

    try {
        const traefikPath = path.join(
            APP_PATH,
            "traefik",
            "traefik_config.yml"
        );

        const schema = z.object({
            experimental: z.object({
                plugins: z.object({
                    badger: z.object({
                        moduleName: z.string(),
                        version: z.string()
                    })
                })
            })
        });

        const traefikFileContents = fs.readFileSync(traefikPath, "utf8");
        const traefikConfig = yaml.load(traefikFileContents) as any;

        const parsedConfig = schema.safeParse(traefikConfig);

        if (!parsedConfig.success) {
            throw new Error(fromZodError(parsedConfig.error).toString());
        }

        traefikConfig.experimental.plugins.badger.version = "v1.4.1";

        const updatedTraefikYaml = yaml.dump(traefikConfig);

        fs.writeFileSync(traefikPath, updatedTraefikYaml, "utf8");

        console.log(
            "Updated the version of Badger in your Traefik configuration to v1.4.1"
        );
    } catch (e) {
        console.log(
            "We were unable to update the version of Badger in your Traefik configuration. Please update it manually. Check the release notes for this version for more information."
        );
        console.error(e);
    }

    console.log(`${version} migration complete`);
}
