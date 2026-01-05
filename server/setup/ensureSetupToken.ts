import { db, setupTokens, users } from "@server/db";
import { eq } from "drizzle-orm";
import { generateRandomString, RandomReader } from "@oslojs/crypto/random";
import moment from "moment";
import logger from "@server/logger";

const random: RandomReader = {
    read(bytes: Uint8Array): void {
        crypto.getRandomValues(bytes);
    }
};

function generateToken(): string {
    // Generate a 32-character alphanumeric token
    const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
    return generateRandomString(random, alphabet, 32);
}

function validateToken(token: string): boolean {
    const tokenRegex = /^[a-z0-9]{32}$/;
    return tokenRegex.test(token);
}

function generateId(length: number): string {
    const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
    return generateRandomString(random, alphabet, length);
}

function showSetupToken(token: string, source: string): void {
    console.log(`=== SETUP TOKEN ${source} ===`);
    console.log("Token:", token);
    console.log("Use this token on the initial setup page");
    console.log("================================");
}

export async function ensureSetupToken() {
    try {
        // Check if a server admin already exists
        const [existingAdmin] = await db
            .select()
            .from(users)
            .where(eq(users.serverAdmin, true));

        // If admin exists, no need for setup token
        if (existingAdmin) {
            logger.debug(
                "Server admin exists. Setup token generation skipped."
            );
            return;
        }

        // Check if a setup token already exists
        const [existingToken] = await db
            .select()
            .from(setupTokens)
            .where(eq(setupTokens.used, false));

        const envSetupToken = process.env.PANGOLIN_SETUP_TOKEN;
        // console.debug("PANGOLIN_SETUP_TOKEN:", envSetupToken);
        if (envSetupToken) {
            if (!validateToken(envSetupToken)) {
                throw new Error(
                    "invalid token format for PANGOLIN_SETUP_TOKEN"
                );
            }

            if (existingToken?.token !== envSetupToken) {
                console.warn(
                    "Overwriting existing token in DB since PANGOLIN_SETUP_TOKEN is set"
                );

                await db
                    .update(setupTokens)
                    .set({ token: envSetupToken })
                    .where(eq(setupTokens.tokenId, existingToken.tokenId));
            } else {
                const tokenId = generateId(15);

                await db.insert(setupTokens).values({
                    tokenId: tokenId,
                    token: envSetupToken,
                    used: false,
                    dateCreated: moment().toISOString(),
                    dateUsed: null
                });
            }

            showSetupToken(envSetupToken, "FROM ENVIRONMENT");
            return;
        }

        // If unused token exists, display it instead of creating a new one
        if (existingToken) {
            showSetupToken(existingToken.token, "EXISTS");
            return;
        }

        // Generate a new setup token
        const token = generateToken();
        const tokenId = generateId(15);

        await db.insert(setupTokens).values({
            tokenId: tokenId,
            token: token,
            used: false,
            dateCreated: moment().toISOString(),
            dateUsed: null
        });

        showSetupToken(token, "GENERATED");
    } catch (error) {
        console.error("Failed to ensure setup token:", error);
        throw error;
    }
}
