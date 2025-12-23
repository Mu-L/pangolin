import { Request, Response, NextFunction } from "express";
import createHttpError from "http-errors";
import { z } from "zod";
import { fromError } from "zod-validation-error";
import HttpCode from "@server/types/HttpCode";
import logger from "@server/logger";
import { response } from "@server/lib/response";
import { db, deviceWebAuthCodes } from "@server/db";
import { alphabet, generateRandomString } from "oslo/crypto";
import { createDate } from "oslo";
import { TimeSpan } from "oslo";
import { maxmindLookup } from "@server/db/maxmind";
import { encodeHexLowerCase } from "@oslojs/encoding";
import { sha256 } from "@oslojs/crypto/sha2";
import { stripPortFromHost } from "@server/lib/ip";

const bodySchema = z
    .object({
        deviceName: z.string().optional(),
        applicationName: z.string().min(1, "Application name is required")
    })
    .strict();

export type StartDeviceWebAuthBody = z.infer<typeof bodySchema>;

export type StartDeviceWebAuthResponse = {
    code: string;
    expiresInSeconds: number;
};

// Helper function to generate device code in format A1AJ-N5JD
function generateDeviceCode(): string {
    const part1 = generateRandomString(4, alphabet("A-Z", "0-9"));
    const part2 = generateRandomString(4, alphabet("A-Z", "0-9"));
    return `${part1}-${part2}`;
}

// Helper function to hash device code before storing in database
function hashDeviceCode(code: string): string {
    return encodeHexLowerCase(sha256(new TextEncoder().encode(code)));
}

// Helper function to get city from IP (if available)
async function getCityFromIp(ip: string): Promise<string | undefined> {
    try {
        if (!maxmindLookup) {
            return undefined;
        }

        const result = maxmindLookup.get(ip);
        if (!result) {
            return undefined;
        }

        if (result.country) {
            return result.country.names?.en || result.country.iso_code;
        }

        return undefined;
    } catch (error) {
        logger.debug("Failed to get city from IP", error);
        return undefined;
    }
}

export async function startDeviceWebAuth(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    const parsedBody = bodySchema.safeParse(req.body);

    if (!parsedBody.success) {
        return next(
            createHttpError(
                HttpCode.BAD_REQUEST,
                fromError(parsedBody.error).toString()
            )
        );
    }

    try {
        const { deviceName, applicationName } = parsedBody.data;

        // Generate device code
        const code = generateDeviceCode();

        // Hash the code before storing in database
        const hashedCode = hashDeviceCode(code);

        // Extract IP from request
        const ip = req.ip ? stripPortFromHost(req.ip) : undefined;

        // Get city (optional, may return undefined)
        const city = ip ? await getCityFromIp(ip) : undefined;

        // Set expiration to 5 minutes from now
        const expiresAt = createDate(new TimeSpan(5, "m")).getTime();

        // Insert into database (store hashed code)
        await db.insert(deviceWebAuthCodes).values({
            code: hashedCode,
            ip: ip || null,
            city: city || null,
            deviceName: deviceName || null,
            applicationName,
            expiresAt,
            createdAt: Date.now()
        });

        // calculate relative expiration in seconds
        const expiresInSeconds = Math.floor((expiresAt - Date.now()) / 1000);

        return response<StartDeviceWebAuthResponse>(res, {
            data: {
                code,
                expiresInSeconds
            },
            success: true,
            error: false,
            message: "Device web auth code generated",
            status: HttpCode.OK
        });
    } catch (e) {
        logger.error(e);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Failed to start device web auth"
            )
        );
    }
}
