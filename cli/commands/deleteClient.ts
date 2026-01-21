import { CommandModule } from "yargs";
import { db, clients, olms, currentFingerprint, userClients, approvals } from "@server/db";
import { eq, and, inArray } from "drizzle-orm";

type DeleteClientArgs = {
    orgId: string;
    niceId: string;
};

export const deleteClient: CommandModule<{}, DeleteClientArgs> = {
    command: "delete-client",
    describe:
        "Delete a client and all associated data (OLMs, current fingerprint, userClients, approvals). Snapshots are preserved.",
    builder: (yargs) => {
        return yargs
            .option("orgId", {
                type: "string",
                demandOption: true,
                describe: "The organization ID"
            })
            .option("niceId", {
                type: "string",
                demandOption: true,
                describe: "The client niceId (identifier)"
            });
    },
    handler: async (argv: { orgId: string; niceId: string }) => {
        try {
            const { orgId, niceId } = argv;

            console.log(
                `Deleting client with orgId: ${orgId}, niceId: ${niceId}...`
            );

            // Find the client
            const [client] = await db
                .select()
                .from(clients)
                .where(and(eq(clients.orgId, orgId), eq(clients.niceId, niceId)))
                .limit(1);

            if (!client) {
                console.error(
                    `Error: Client with orgId "${orgId}" and niceId "${niceId}" not found.`
                );
                process.exit(1);
            }

            const clientId = client.clientId;
            console.log(`Found client with clientId: ${clientId}`);

            // Find all OLMs associated with this client
            const associatedOlms = await db
                .select()
                .from(olms)
                .where(eq(olms.clientId, clientId));

            console.log(`Found ${associatedOlms.length} OLM(s) associated with this client`);

            // Delete in a transaction to ensure atomicity
            await db.transaction(async (trx) => {
                // Delete currentFingerprint entries for the associated OLMs
                // Note: We delete these explicitly before deleting OLMs to ensure
                // we have control, even though cascade would handle it
                let fingerprintCount = 0;
                if (associatedOlms.length > 0) {
                    const olmIds = associatedOlms.map((olm) => olm.olmId);
                    const deletedFingerprints = await trx
                        .delete(currentFingerprint)
                        .where(inArray(currentFingerprint.olmId, olmIds))
                        .returning();
                    fingerprintCount = deletedFingerprints.length;
                }
                console.log(`Deleted ${fingerprintCount} current fingerprint(s)`);

                // Delete OLMs
                // Note: OLMs have onDelete: "set null" for clientId, so we need to delete them explicitly
                const deletedOlms = await trx
                    .delete(olms)
                    .where(eq(olms.clientId, clientId))
                    .returning();
                console.log(`Deleted ${deletedOlms.length} OLM(s)`);

                // Delete approvals
                // Note: Approvals have onDelete: "cascade" but we delete explicitly for clarity
                const deletedApprovals = await trx
                    .delete(approvals)
                    .where(eq(approvals.clientId, clientId))
                    .returning();
                console.log(`Deleted ${deletedApprovals.length} approval(s)`);

                // Delete userClients
                // Note: userClients have onDelete: "cascade" but we delete explicitly for clarity
                const deletedUserClients = await trx
                    .delete(userClients)
                    .where(eq(userClients.clientId, clientId))
                    .returning();
                console.log(`Deleted ${deletedUserClients.length} userClient association(s)`);

                // Finally, delete the client itself
                const deletedClients = await trx
                    .delete(clients)
                    .where(eq(clients.clientId, clientId))
                    .returning();
                console.log(`Deleted client: ${deletedClients[0]?.name || niceId}`);
            });

            console.log("\nClient deletion completed successfully!");
            console.log("\nSummary:");
            console.log(`  - Client: ${niceId} (clientId: ${clientId})`);
            console.log(`  - Olm(s): ${associatedOlms.length}`);
            console.log(`  - Current fingerprints: deleted`);
            console.log(`  - Approvals: deleted`);
            console.log(`  - UserClients: deleted`);
            console.log(`  - Snapshots: preserved (not deleted)`);

            process.exit(0);
        } catch (error) {
            console.error("Error deleting client:", error);
            process.exit(1);
        }
    }
};
