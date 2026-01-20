import { sendToClient } from "#dynamic/routers/ws";
import { db, olms } from "@server/db";
import { eq } from "drizzle-orm";
import { OlmErrorCodes } from "../olm/error";

export async function sendTerminateClient(
    clientId: number,
    error: (typeof OlmErrorCodes)[keyof typeof OlmErrorCodes],
    olmId?: string | null
) {
    if (!olmId) {
        const [olm] = await db
            .select()
            .from(olms)
            .where(eq(olms.clientId, clientId))
            .limit(1);
        if (!olm) {
            throw new Error(`Olm with ID ${clientId} not found`);
        }
        olmId = olm.olmId;
    }

    await sendToClient(olmId, {
        type: `olm/terminate`,
        data: {
            code: error.code,
            message: error.message
        }
    });
}
