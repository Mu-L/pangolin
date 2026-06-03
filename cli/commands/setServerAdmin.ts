import { CommandModule } from "yargs";
import { db, users } from "@server/db";
import { eq } from "drizzle-orm";

type SetServerAdminArgs = {
    email: string;
};

export const setServerAdmin: CommandModule<{}, SetServerAdminArgs> = {
    command: "set-server-admin",
    describe: "Mark any user as a server admin by email address",
    builder: (yargs) => {
        return yargs.option("email", {
            type: "string",
            demandOption: true,
            describe: "User email address"
        });
    },
    handler: async (argv: { email: string }) => {
        try {
            const email = argv.email.trim().toLowerCase();

            const [user] = await db
                .select()
                .from(users)
                .where(eq(users.email, email))
                .limit(1);

            if (!user) {
                console.error(`User with email '${email}' not found`);
                process.exit(1);
            }

            if (user.serverAdmin) {
                console.log(`User '${email}' is already a server admin`);
                process.exit(0);
            }

            await db
                .update(users)
                .set({ serverAdmin: true })
                .where(eq(users.userId, user.userId));

            console.log(`User '${email}' has been marked as a server admin`);
            process.exit(0);
        } catch (error) {
            console.error("Error:", error);
            process.exit(1);
        }
    }
};
