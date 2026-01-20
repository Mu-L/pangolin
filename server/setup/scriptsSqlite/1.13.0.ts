import { __DIRNAME, APP_PATH } from "@server/lib/consts";
import Database from "better-sqlite3";
import { readFileSync } from "fs";
import path, { join } from "path";

const version = "1.13.0";

const dev = process.env.ENVIRONMENT !== "prod";
let file;
if (!dev) {
    file = join(__DIRNAME, "names.json");
} else {
    file = join("server/db/names.json");
}
export const names = JSON.parse(readFileSync(file, "utf-8"));

export function generateName(): string {
    const name = (
        names.descriptors[
            Math.floor(Math.random() * names.descriptors.length)
        ] +
        "-" +
        names.animals[Math.floor(Math.random() * names.animals.length)]
    )
        .toLowerCase()
        .replace(/\s/g, "-");

    // clean out any non-alphanumeric characters except for dashes
    return name.replace(/[^a-z0-9-]/g, "");
}

export default async function migration() {
    console.log(`Running setup script ${version}...`);

    const location = path.join(APP_PATH, "db", "db.sqlite");
    const db = new Database(location);

    try {
        db.pragma("foreign_keys = OFF");

        db.transaction(() => {
            db.prepare(
                `ALTER TABLE 'clientSites' RENAME TO 'clientSitesAssociationsCache';`
            ).run();

            db.prepare(
                `ALTER TABLE 'clients' RENAME COLUMN 'id' TO 'clientId';`
            ).run();

            db.prepare(
                `
        CREATE TABLE 'clientSiteResources' (
            'clientId' integer NOT NULL,
            'siteResourceId' integer NOT NULL,
            FOREIGN KEY ('clientId') REFERENCES 'clients'('clientId') ON UPDATE no action ON DELETE cascade,
            FOREIGN KEY ('siteResourceId') REFERENCES 'siteResources'('siteResourceId') ON UPDATE no action ON DELETE cascade
        );
        `
            ).run();

            db.prepare(
                `
        CREATE TABLE 'clientSiteResourcesAssociationsCache' (
            'clientId' integer NOT NULL,
            'siteResourceId' integer NOT NULL
        );
        `
            ).run();

            db.prepare(
                `
        CREATE TABLE 'deviceWebAuthCodes' (
            'codeId' integer PRIMARY KEY AUTOINCREMENT NOT NULL,
            'code' text NOT NULL,
            'ip' text,
            'city' text,
            'deviceName' text,
            'applicationName' text NOT NULL,
            'expiresAt' integer NOT NULL,
            'createdAt' integer NOT NULL,
            'verified' integer DEFAULT false NOT NULL,
            'userId' text,
            FOREIGN KEY ('userId') REFERENCES 'user'('id') ON UPDATE no action ON DELETE cascade
        );
        `
            ).run();

            db.prepare(
                `CREATE UNIQUE INDEX 'deviceWebAuthCodes_code_unique' ON 'deviceWebAuthCodes' ('code');`
            ).run();

            db.prepare(
                `
        CREATE TABLE 'roleSiteResources' (
            'roleId' integer NOT NULL,
            'siteResourceId' integer NOT NULL,
            FOREIGN KEY ('roleId') REFERENCES 'roles'('roleId') ON UPDATE no action ON DELETE cascade,
            FOREIGN KEY ('siteResourceId') REFERENCES 'siteResources'('siteResourceId') ON UPDATE no action ON DELETE cascade
        );
        `
            ).run();

            db.prepare(
                `
        CREATE TABLE 'userSiteResources' (
            'userId' text NOT NULL,
            'siteResourceId' integer NOT NULL,
            FOREIGN KEY ('userId') REFERENCES 'user'('id') ON UPDATE no action ON DELETE cascade,
            FOREIGN KEY ('siteResourceId') REFERENCES 'siteResources'('siteResourceId') ON UPDATE no action ON DELETE cascade
        );
        `
            ).run();

            db.prepare(
                `
        CREATE TABLE '__new_clientSitesAssociationsCache' (
            'clientId' integer NOT NULL,
            'siteId' integer NOT NULL,
            'isRelayed' integer DEFAULT false NOT NULL,
            'endpoint' text,
            'publicKey' text
        );
        `
            ).run();

            db.prepare(
                `INSERT INTO '__new_clientSitesAssociationsCache'("clientId", "siteId", "isRelayed", "endpoint", "publicKey") SELECT "clientId", "siteId", "isRelayed", "endpoint", NULL FROM 'clientSitesAssociationsCache';`
            ).run();

            db.prepare(`DROP TABLE 'clientSitesAssociationsCache';`).run();

            db.prepare(
                `ALTER TABLE '__new_clientSitesAssociationsCache' RENAME TO 'clientSitesAssociationsCache';`
            ).run();

            db.prepare(
                `ALTER TABLE 'clients' ADD 'userId' text REFERENCES 'user'('id');`
            ).run();

            db.prepare(
                `ALTER TABLE 'clients' ADD COLUMN 'niceId' TEXT NOT NULL DEFAULT 'PLACEHOLDER';`
            ).run();

            db.prepare(`ALTER TABLE 'clients' ADD 'olmId' text;`).run();

            db.prepare(
                `
        CREATE TABLE '__new_siteResources' (
            'siteResourceId' integer PRIMARY KEY AUTOINCREMENT NOT NULL,
            'siteId' integer NOT NULL,
            'orgId' text NOT NULL,
            'niceId' text NOT NULL,
            'name' text NOT NULL,
            'mode' text NOT NULL,
            'protocol' text,
            'proxyPort' integer,
            'destinationPort' integer,
            'destination' text NOT NULL,
            'enabled' integer DEFAULT true NOT NULL,
            'alias' text,
            'aliasAddress' text,
            FOREIGN KEY ('siteId') REFERENCES 'sites'('siteId') ON UPDATE no action ON DELETE cascade,
            FOREIGN KEY ('orgId') REFERENCES 'orgs'('orgId') ON UPDATE no action ON DELETE cascade
        );
        `
            ).run();

            db.prepare(
                `INSERT INTO '__new_siteResources'("siteResourceId", "siteId", "orgId", "niceId", "name", "mode", "protocol", "proxyPort", "destinationPort", "destination", "enabled", "alias", "aliasAddress") SELECT "siteResourceId", "siteId", "orgId", "niceId", "name", 'host', "protocol", "proxyPort", "destinationPort", "destinationIp", "enabled", NULL, NULL FROM 'siteResources';`
            ).run();

            db.prepare(`DROP TABLE 'siteResources';`).run();

            db.prepare(
                `ALTER TABLE '__new_siteResources' RENAME TO 'siteResources';`
            ).run();

            db.prepare(
                `
        CREATE TABLE '__new_olms' (
            'id' text PRIMARY KEY NOT NULL,
            'secretHash' text NOT NULL,
            'dateCreated' text NOT NULL,
            'version' text,
            'agent' text,
            'name' text,
            'clientId' integer,
            'userId' text,
            FOREIGN KEY ('clientId') REFERENCES 'clients'('clientId') ON UPDATE no action ON DELETE set null,
            FOREIGN KEY ('userId') REFERENCES 'user'('id') ON UPDATE no action ON DELETE cascade
        );
        `
            ).run();

            db.prepare(
                `INSERT INTO '__new_olms'("id", "secretHash", "dateCreated", "version", "agent", "name", "clientId", "userId") SELECT "id", "secretHash", "dateCreated", "version", NULL, NULL, "clientId", NULL FROM 'olms';`
            ).run();

            db.prepare(`DROP TABLE 'olms';`).run();

            db.prepare(`ALTER TABLE '__new_olms' RENAME TO 'olms';`).run();

            db.prepare(
                `
        CREATE TABLE '__new_roleClients' (
            'roleId' integer NOT NULL,
            'clientId' integer NOT NULL,
            FOREIGN KEY ('roleId') REFERENCES 'roles'('roleId') ON UPDATE no action ON DELETE cascade,
            FOREIGN KEY ('clientId') REFERENCES 'clients'('clientId') ON UPDATE no action ON DELETE cascade
        );
        `
            ).run();

            db.prepare(
                `INSERT INTO '__new_roleClients'("roleId", "clientId") SELECT "roleId", "clientId" FROM 'roleClients';`
            ).run();

            db.prepare(`DROP TABLE 'roleClients';`).run();

            db.prepare(
                `ALTER TABLE '__new_roleClients' RENAME TO 'roleClients';`
            ).run();

            db.prepare(
                `
        CREATE TABLE '__new_userClients' (
            'userId' text NOT NULL,
            'clientId' integer NOT NULL,
            FOREIGN KEY ('userId') REFERENCES 'user'('id') ON UPDATE no action ON DELETE cascade,
            FOREIGN KEY ('clientId') REFERENCES 'clients'('clientId') ON UPDATE no action ON DELETE cascade
        );
        `
            ).run();

            db.prepare(
                `INSERT INTO '__new_userClients'("userId", "clientId") SELECT "userId", "clientId" FROM 'userClients';`
            ).run();

            db.prepare(`DROP TABLE 'userClients';`).run();

            db.prepare(
                `ALTER TABLE '__new_userClients' RENAME TO 'userClients';`
            ).run();

            db.prepare(`ALTER TABLE 'orgs' ADD 'utilitySubnet' text;`).run();

            db.prepare(
                `ALTER TABLE 'session' ADD 'deviceAuthUsed' integer DEFAULT false NOT NULL;`
            ).run();

            db.prepare(
                `ALTER TABLE 'targetHealthCheck' ADD 'hcTlsServerName' text;`
            ).run();

            // set 100.96.128.0/24 as the utility subnet on all of the orgs
            db.prepare(
                `UPDATE 'orgs' SET 'utilitySubnet' = '100.96.128.0/24'`
            ).run();

            // Query all of the sites to get their remoteSubnets before dropping the column
            const sitesRemoteSubnets = db
                .prepare(
                    `SELECT siteId, remoteSubnets FROM 'sites' WHERE remoteSubnets IS NOT NULL`
                )
                .all() as {
                siteId: number;
                remoteSubnets: string | null;
            }[];

            db.prepare(
                `ALTER TABLE 'sites' DROP COLUMN 'remoteSubnets';`
            ).run();

            // get all of the siteResources and set the aliasAddress to 100.96.128.x starting at .8
            const siteResourcesForAlias = db
                .prepare(
                    `SELECT siteResourceId FROM 'siteResources' ORDER BY siteResourceId ASC`
                )
                .all() as {
                siteResourceId: number;
            }[];

            const updateAliasAddress = db.prepare(
                `UPDATE 'siteResources' SET aliasAddress = ? WHERE siteResourceId = ?`
            );

            let aliasIpOctet = 8;
            for (const siteResource of siteResourcesForAlias) {
                const aliasAddress = `100.96.128.${aliasIpOctet}`;
                updateAliasAddress.run(
                    aliasAddress,
                    siteResource.siteResourceId
                );
                aliasIpOctet++;
            }

            // For each site with remote subnets we need to create a site resource of type cidr for each remote subnet
            const insertCidrResource = db.prepare(
                `INSERT INTO 'siteResources' ('siteId', 'destination', 'mode', 'name', 'orgId', 'niceId') 
                 SELECT ?, ?, 'cidr', 'Remote Subnet', orgId, ? FROM 'sites' WHERE siteId = ?`
            );

            for (const site of sitesRemoteSubnets) {
                if (site.remoteSubnets) {
                    const subnets = site.remoteSubnets.split(",");
                    for (const subnet of subnets) {
                        // Generate a unique niceId for each new site resource
                        const niceId = generateName();
                        insertCidrResource.run(
                            site.siteId,
                            subnet.trim(),
                            niceId,
                            site.siteId
                        );
                    }
                }
            }

            // Associate clients with site resources based on their previous site access
            // Get all client-site associations from the renamed clientSitesAssociationsCache table
            const clientSiteAssociations = db
                .prepare(
                    `SELECT clientId, siteId FROM 'clientSitesAssociationsCache'`
                )
                .all() as {
                clientId: number;
                siteId: number;
            }[];

            const getSiteResources = db.prepare(
                `SELECT siteResourceId FROM 'siteResources' WHERE siteId = ?`
            );

            const insertClientSiteResource = db.prepare(
                `INSERT INTO 'clientSiteResources' ('clientId', 'siteResourceId') VALUES (?, ?)`
            );

            // create a clientSiteResourcesAssociationsCache entry for each existing association as well
            const insertClientSiteResourceCache = db.prepare(
                `INSERT INTO 'clientSiteResourcesAssociationsCache' ('clientId', 'siteResourceId') VALUES (?, ?)`
            );

            // For each client-site association, find all site resources for that site
            for (const association of clientSiteAssociations) {
                const siteResources = getSiteResources.all(
                    association.siteId
                ) as {
                    siteResourceId: number;
                }[];

                // Associate the client with all site resources from this site
                for (const siteResource of siteResources) {
                    insertClientSiteResource.run(
                        association.clientId,
                        siteResource.siteResourceId
                    );
                    insertClientSiteResourceCache.run(
                        association.clientId,
                        siteResource.siteResourceId
                    );
                }
            }

            // Associate existing site resources with their org's admin role
            const siteResourcesWithOrg = db
                .prepare(`SELECT siteResourceId, orgId FROM 'siteResources'`)
                .all() as {
                siteResourceId: number;
                orgId: string;
            }[];

            const getAdminRole = db.prepare(
                `SELECT roleId FROM 'roles' WHERE orgId = ? AND isAdmin = 1 LIMIT 1`
            );

            const checkExistingAssociation = db.prepare(
                `SELECT 1 FROM 'roleSiteResources' WHERE roleId = ? AND siteResourceId = ? LIMIT 1`
            );

            const insertRoleSiteResource = db.prepare(
                `INSERT INTO 'roleSiteResources' ('roleId', 'siteResourceId') VALUES (?, ?)`
            );

            for (const siteResource of siteResourcesWithOrg) {
                const adminRole = getAdminRole.get(siteResource.orgId) as
                    | { roleId: number }
                    | undefined;

                if (adminRole) {
                    const existing = checkExistingAssociation.get(
                        adminRole.roleId,
                        siteResource.siteResourceId
                    );

                    if (!existing) {
                        insertRoleSiteResource.run(
                            adminRole.roleId,
                            siteResource.siteResourceId
                        );
                    }
                }
            }

            // Populate niceId for clients
            const clients = db
                .prepare(`SELECT clientId FROM 'clients'`)
                .all() as {
                clientId: number;
            }[];

            const usedNiceIds: string[] = [];

            for (const clientId of clients) {
                // Generate a unique name and ensure it's unique
                let niceId = "";
                let loops = 0;
                while (true) {
                    if (loops > 100) {
                        throw new Error("Could not generate a unique name");
                    }

                    niceId = generateName();
                    if (!usedNiceIds.includes(niceId)) {
                        usedNiceIds.push(niceId);
                        break;
                    }
                    loops++;
                }
                db.prepare(
                    `UPDATE clients SET niceId = ? WHERE clientId = ?`
                ).run(niceId, clientId.clientId);
            }
        })();

        db.pragma("foreign_keys = ON");

        console.log(`Migrated database`);
    } catch (e) {
        console.log("Failed to migrate db:", e);
        throw e;
    }

    console.log(`${version} migration complete`);
}
