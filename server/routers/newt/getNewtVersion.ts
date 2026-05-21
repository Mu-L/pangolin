import { db } from "@server/db";
import { newts } from "@server/db";
import { eq } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";
import createHttpError from "http-errors";
import { z } from "zod";
import { fromError } from "zod-validation-error";
import semver from "semver";
import { verifyPassword } from "@server/auth/password";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import logger from "@server/logger";
import cache from "#dynamic/lib/cache";
import config from "@server/lib/config";

// Stale-while-revalidate cache for the latest newt version.
let staleNewtVersion: string | null = null;

async function getLatestNewtVersion(): Promise<string | null> {
    try {
        const cachedVersion = await cache.get<string>(
            "cache:latestNewtVersion"
        );
        if (cachedVersion) {
            return cachedVersion;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);

        const fetchResponse = await fetch(
            "https://api.github.com/repos/fosrl/newt/tags",
            { signal: controller.signal }
        );

        clearTimeout(timeoutId);

        if (!fetchResponse.ok) {
            logger.warn(
                `Failed to fetch latest Newt version from GitHub: ${fetchResponse.status} ${fetchResponse.statusText}`
            );
            return staleNewtVersion;
        }

        let tags = await fetchResponse.json();
        if (!Array.isArray(tags) || tags.length === 0) {
            logger.warn("No tags found for Newt repository");
            return staleNewtVersion;
        }

        tags = tags.filter((tag: any) => !tag.name.includes("rc"));
        tags.sort((a: any, b: any) => {
            const va = semver.coerce(a.name);
            const vb = semver.coerce(b.name);
            if (!va && !vb) return 0;
            if (!va) return 1;
            if (!vb) return -1;
            return semver.rcompare(va, vb);
        });

        const seen = new Set<string>();
        tags = tags.filter((tag: any) => {
            const normalised = semver.coerce(tag.name)?.version;
            if (!normalised || seen.has(normalised)) return false;
            seen.add(normalised);
            return true;
        });

        if (tags.length === 0) {
            logger.warn("No valid semver tags found for Newt repository");
            return staleNewtVersion;
        }

        const latestVersion = tags[0].name;
        staleNewtVersion = latestVersion;
        await cache.set("cache:latestNewtVersion", latestVersion, 3600);

        return latestVersion;
    } catch (error: any) {
        if (error.name === "AbortError") {
            logger.warn(
                "Request to fetch latest Newt version timed out (1.5s)"
            );
        } else {
            logger.warn(
                "Error fetching latest Newt version:",
                error.message || error
            );
        }
        return staleNewtVersion;
    }
}

const bodySchema = z.object({
    newtId: z.string(),
    secret: z.string(),
    platform: z.string() // e.g. "linux_amd64", "darwin_arm64"
});

export type GetNewtVersionBody = z.infer<typeof bodySchema>;

export type GetNewtVersionResponse = {
    latestVersion: string;
    currentIsLatest: boolean;
    downloadUrl: string;
};

export async function getNewtVersion(
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

    const { newtId, secret, platform } = parsedBody.data;

    try {
        // Verify newt credentials
        const existingNewtRes = await db
            .select()
            .from(newts)
            .where(eq(newts.newtId, newtId));

        if (!existingNewtRes || !existingNewtRes.length) {
            if (config.getRawConfig().app.log_failed_attempts) {
                logger.info(
                    `Newt version check: no newt found with ID ${newtId}. IP: ${req.ip}.`
                );
            }
            return next(
                createHttpError(
                    HttpCode.UNAUTHORIZED,
                    "Invalid credentials"
                )
            );
        }

        const existingNewt = existingNewtRes[0];

        const validSecret = await verifyPassword(
            secret,
            existingNewt.secretHash
        );
        if (!validSecret) {
            if (config.getRawConfig().app.log_failed_attempts) {
                logger.info(
                    `Newt version check: invalid secret for newt ID ${newtId}. IP: ${req.ip}.`
                );
            }
            return next(
                createHttpError(
                    HttpCode.UNAUTHORIZED,
                    "Invalid credentials"
                )
            );
        }

        // Fetch latest version
        const latestVersion = await getLatestNewtVersion();

        if (!latestVersion) {
            return next(
                createHttpError(
                    HttpCode.INTERNAL_SERVER_ERROR,
                    "Unable to determine latest Newt version"
                )
            );
        }

        // Normalise the tag (strip leading 'v' for the URL, but keep original for comparison)
        const tagForUrl = latestVersion.startsWith("v")
            ? latestVersion
            : `v${latestVersion}`;

        // Binary name follows the get-newt.sh convention: newt_<platform>[.exe]
        const binaryName =
            platform.includes("windows")
                ? `newt_${platform}.exe`
                : `newt_${platform}`;

        const downloadUrl = `https://github.com/fosrl/newt/releases/download/${tagForUrl}/${binaryName}`;

        // Determine whether the newt that's asking is already up to date.
        // We store the current version on the newt row when it registers.
        const currentVersion = existingNewt.version ?? null;
        let currentIsLatest = false;
        if (currentVersion) {
            try {
                const latest = semver.coerce(latestVersion);
                const current = semver.coerce(currentVersion);
                if (latest && current) {
                    currentIsLatest = !semver.lt(current, latest);
                }
            } catch {
                // If we can't compare, assume not latest
            }
        }

        return response<GetNewtVersionResponse>(res, {
            data: {
                latestVersion,
                currentIsLatest,
                downloadUrl
            },
            success: true,
            error: false,
            message: "Version info retrieved successfully",
            status: HttpCode.OK
        });
    } catch (e) {
        logger.error(e);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Failed to retrieve version info"
            )
        );
    }
}
