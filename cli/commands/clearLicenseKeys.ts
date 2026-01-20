import { CommandModule } from "yargs";
import { db, licenseKey } from "@server/db";
import { eq } from "drizzle-orm";

type ClearLicenseKeysArgs = { };

export const clearLicenseKeys: CommandModule<
    {},
    ClearLicenseKeysArgs
> = {
    command: "clear-license-keys",
    describe:
        "Clear all license keys from the database",
    // no args
    builder: (yargs) => {
        return yargs;
    },
    handler: async (argv: {}) => {
        try {

            console.log(`Clearing all license keys from the database`);

            // Delete all license keys
            const deletedCount = await db
                .delete(licenseKey)
                .where(eq(licenseKey.licenseKeyId, licenseKey.licenseKeyId))  .returning();; // delete all

            console.log(`Deleted ${deletedCount.length} license key(s) from the database`);

            process.exit(0);
        } catch (error) {
            console.error("Error:", error);
            process.exit(1);
        }
    }
};
