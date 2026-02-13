import { db } from "@server/db/pg/driver";
import { sql } from "drizzle-orm";
import { __DIRNAME } from "@server/lib/consts";

const version = "1.15.3";

export default async function migration() {
    console.log(`Running setup script ${version}...`);

    try {
        await db.execute(sql`BEGIN`);

        await db.execute(
            sql`ALTER TABLE "limits" ADD COLUMN "override" boolean DEFAULT false;`
        );
        await db.execute(
            sql`ALTER TABLE "subscriptionItems" ADD COLUMN "stripeSubscriptionItemId" varchar(255);`
        );
        await db.execute(
            sql`ALTER TABLE "subscriptionItems" ADD COLUMN "featureId" varchar(255);`
        );
        await db.execute(
            sql`ALTER TABLE "subscriptions" ADD COLUMN "version" integer;`
        );
        await db.execute(
            sql`ALTER TABLE "subscriptions" ADD COLUMN "type" varchar(50);`
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
