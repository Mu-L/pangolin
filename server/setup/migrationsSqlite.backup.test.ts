import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import { assertEquals } from "@test/assert";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const migrationsScript = path.join(here, "migrationsSqlite.ts");

const SEED_STATEMENTS = [
    `CREATE TABLE versionMigrations (version TEXT PRIMARY KEY, executedAt INTEGER NOT NULL)`,
    `INSERT INTO versionMigrations (version, executedAt) VALUES ('1.21.0', 1750000000000)`,
    `CREATE TABLE sites (siteId INTEGER PRIMARY KEY AUTOINCREMENT, subnet TEXT)`,
    `INSERT INTO sites (subnet) VALUES ('10.0.0.0/24')`,
    `CREATE TABLE roles (roleId INTEGER PRIMARY KEY AUTOINCREMENT, orgId TEXT, isAdmin INTEGER DEFAULT 0, sshSudoMode TEXT DEFAULT 'none')`,
    `INSERT INTO roles (orgId, isAdmin, sshSudoMode) VALUES ('org1', 0, 'none')`,
    `CREATE TABLE licenseKey (licenseKeyId INTEGER PRIMARY KEY AUTOINCREMENT)`,
    `CREATE TABLE targets (targetId INTEGER PRIMARY KEY AUTOINCREMENT, resourceId INTEGER, siteId INTEGER NOT NULL, ip TEXT NOT NULL, method TEXT, port INTEGER NOT NULL, internalPort INTEGER, enabled INTEGER DEFAULT 1, path TEXT, pathMatchType TEXT, rewritePath TEXT, rewritePathType TEXT, priority INTEGER DEFAULT 100, mode TEXT DEFAULT 'http', authToken TEXT)`,
    `CREATE TABLE subscriptions (subscriptionId INTEGER PRIMARY KEY AUTOINCREMENT)`,
    `CREATE TABLE clients (clientId INTEGER PRIMARY KEY AUTOINCREMENT)`,
    `CREATE TABLE orgs (orgId TEXT PRIMARY KEY)`,
    `INSERT INTO orgs (orgId) VALUES ('org1')`,
    `CREATE TABLE siteResources (siteResourceId INTEGER PRIMARY KEY AUTOINCREMENT)`,
    `CREATE TABLE eventStreamingDestinations (destinationId INTEGER PRIMARY KEY AUTOINCREMENT)`,
    `CREATE TABLE roleActions (roleId INTEGER, actionId TEXT, orgId TEXT)`,
    `CREATE TABLE newt (newtId INTEGER PRIMARY KEY AUTOINCREMENT)`
];

function seedDatabase(dbPath: string) {
    const db = new Database(dbPath);
    try {
        for (const statement of SEED_STATEMENTS) {
            db.exec(statement);
        }
    } finally {
        db.close();
    }
}

function siteColumns(dbPath: string): string[] {
    const db = new Database(dbPath, { readonly: true });
    try {
        return (
            db.prepare(`PRAGMA table_info(sites)`).all() as Array<{
                name: unknown;
            }>
        ).map((row) => String(row.name));
    } finally {
        db.close();
    }
}

function runMigrations(workdir: string): {
    exitCode: number;
    output: string;
} {
    const tsconfig = ["tsconfig.json", "tsconfig.oss.json"]
        .map((file) => path.join(repoRoot, file))
        .find((file) => fs.existsSync(file));
    if (!tsconfig) {
        throw new Error("No tsconfig found for @server path aliases");
    }
    const tsxCli = path.join(
        repoRoot,
        "node_modules",
        "tsx",
        "dist",
        "cli.mjs"
    );
    if (!fs.existsSync(tsxCli)) {
        throw new Error("tsx is not installed; run npm ci first");
    }
    try {
        const output = execFileSync(
            process.execPath,
            [tsxCli, "--tsconfig", tsconfig, migrationsScript],
            { cwd: workdir, timeout: 120000, encoding: "utf8" }
        );
        return { exitCode: 0, output };
    } catch (error) {
        const output =
            error instanceof Error
                ? (error as Error & { stdout?: unknown }).stdout
                : "";
        return { exitCode: 1, output: String(output ?? "") };
    }
}

function testSingleBackupPerUpgrade() {
    console.log("Running single backup per upgrade test...");
    for (const generated of ["server/build.ts", "server/db/index.ts"]) {
        if (!fs.existsSync(path.join(repoRoot, generated))) {
            throw new Error(
                `Missing ${generated}; run npm run set:oss && npm run set:sqlite first`
            );
        }
    }
    const workdir = fs.mkdtempSync(
        path.join(os.tmpdir(), "pangolin-backup-test-")
    );
    try {
        fs.mkdirSync(path.join(workdir, "config", "db"), { recursive: true });
        fs.copyFileSync(
            path.join(repoRoot, "config", "config.example.yml"),
            path.join(workdir, "config", "config.yml")
        );
        fs.symlinkSync(
            path.join(repoRoot, "server"),
            path.join(workdir, "server"),
            process.platform === "win32" ? "junction" : "dir"
        );
        seedDatabase(path.join(workdir, "config", "db", "db.sqlite"));
        const result = runMigrations(workdir);
        assertEquals(result.exitCode, 0, "Seeded migrations must run cleanly");
        if (!result.output.includes("All migrations completed successfully")) {
            throw new Error(
                "Seeded migrations did not complete; the backup assertions below would be vacuous"
            );
        }
        const backupsDir = path.join(workdir, "config", "db", "backups");
        const backups = fs.existsSync(backupsDir)
            ? fs
                  .readdirSync(backupsDir)
                  .filter((file) => file.endsWith(".sqlite"))
            : [];
        assertEquals(
            backups.length,
            1,
            "One upgrade must produce exactly one database backup even with several pending migrations"
        );
        const columns = siteColumns(path.join(backupsDir, backups[0]));
        if (!columns.includes("subnet")) {
            throw new Error(
                `The single backup must be the pre-upgrade snapshot (sites.subnet), got sites(${columns.join(",")})`
            );
        }
    } finally {
        fs.rmSync(workdir, { recursive: true, force: true });
    }
}

try {
    testSingleBackupPerUpgrade();
    console.log("All tests passed successfully!");
} catch (error) {
    console.error("Test failed:", error);
    process.exit(1);
}
