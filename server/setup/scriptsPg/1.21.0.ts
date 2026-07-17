import { db } from "@server/db/pg/driver";
import { sql } from "drizzle-orm";

const version = "1.21.0";

export default async function migration() {
    console.log(`Running setup script ${version}...`);

    try {
        await db.execute(sql`BEGIN`);

        await db.execute(sql`
            ALTER TABLE "resourceAccessToken" ADD COLUMN "userId" varchar;
        `);

        await db.execute(sql`
            ALTER TABLE "resourceAccessToken" ADD COLUMN "persistSession" boolean DEFAULT false NOT NULL;
        `);

        await db.execute(sql`
            ALTER TABLE "resources" ADD COLUMN "status" varchar DEFAULT 'approved';
        `);

        await db.execute(sql`
            ALTER TABLE "siteResources" ADD COLUMN "status" varchar DEFAULT 'approved';
        `);

        await db.execute(sql`
            ALTER TABLE "sites" ADD COLUMN "localEndpoints" varchar;
        `);

        await db.execute(sql`
            ALTER TABLE "resourceAccessToken" ADD CONSTRAINT "resourceAccessToken_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
        `);

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
