import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./driver";
import path from "path";

const migrationsFolder = path.join("server/migrations");

export const runMigrations = async () => {
    console.log("Running migrations...");
    try {
        migrate(db as any, {
            migrationsFolder: migrationsFolder
        });
        console.log("Migrations completed successfully.");
    } catch (error) {
        console.error("Error running migrations:", error);
        process.exit(1);
    }
};
