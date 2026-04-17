import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db, statusHistory } from "@server/db";
import { and, eq, gte, asc } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";

const siteParamsSchema = z.object({
    siteId: z.string().transform((v) => parseInt(v, 10)),
});

const healthCheckParamsSchema = z.object({
    targetHealthCheckId: z.string().transform((v) => parseInt(v, 10)),
});

const querySchema = z
    .object({
        days: z
            .string()
            .optional()
            .transform((v) => (v ? parseInt(v, 10) : 90)),
    })
    .pipe(
        z.object({
            days: z.number().int().min(1).max(365),
        })
    );

export interface DayBucket {
    date: string; // ISO date "YYYY-MM-DD"
    uptimePercent: number; // 0-100
    totalDowntimeSeconds: number;
    downtimeWindows: { start: number; end: number | null; status: string }[];
    status: "good" | "degraded" | "bad" | "no_data";
}

export interface StatusHistoryResponse {
    entityType: string;
    entityId: number;
    days: DayBucket[];
    overallUptimePercent: number;
    totalDowntimeSeconds: number;
}

function computeBuckets(
    events: { entityType: string; entityId: number; orgId: string; status: string; timestamp: number; id: number }[],
    days: number
): { buckets: DayBucket[]; totalDowntime: number } {
    const nowSec = Math.floor(Date.now() / 1000);
    const buckets: DayBucket[] = [];
    let totalDowntime = 0;

    for (let d = 0; d < days; d++) {
        const dayStartSec = nowSec - (days - d) * 86400;
        const dayEndSec = dayStartSec + 86400;

        const dayEvents = events.filter(
            (e) => e.timestamp >= dayStartSec && e.timestamp < dayEndSec
        );

        // Determine the status at the start of this day (last event before dayStart)
        const lastBeforeDay = [...events]
            .filter((e) => e.timestamp < dayStartSec)
            .at(-1);

        let currentStatus = lastBeforeDay?.status ?? null;

        const windows: { start: number; end: number | null; status: string }[] = [];
        let dayDowntime = 0;

        let windowStart = dayStartSec;
        let windowStatus = currentStatus;

        for (const evt of dayEvents) {
            if (windowStatus !== null && windowStatus !== evt.status) {
                const windowEnd = evt.timestamp;
                const isDown =
                    windowStatus === "offline" ||
                    windowStatus === "unhealthy" ||
                    windowStatus === "unknown";
                if (isDown) {
                    dayDowntime += windowEnd - windowStart;
                    windows.push({
                        start: windowStart,
                        end: windowEnd,
                        status: windowStatus,
                    });
                }
            }
            windowStart = evt.timestamp;
            windowStatus = evt.status;
        }

        // Close the final window at the end of the day (or now if day hasn't ended)
        if (windowStatus !== null) {
            const finalEnd = Math.min(dayEndSec, nowSec);
            const isDown =
                windowStatus === "offline" ||
                windowStatus === "unhealthy" ||
                windowStatus === "unknown";
            if (isDown && finalEnd > windowStart) {
                dayDowntime += finalEnd - windowStart;
                windows.push({
                    start: windowStart,
                    end: finalEnd,
                    status: windowStatus,
                });
            }
        }

        totalDowntime += dayDowntime;

        const effectiveDayLength = Math.max(
            0,
            Math.min(dayEndSec, nowSec) - dayStartSec
        );
        const uptimePct =
            effectiveDayLength > 0
                ? Math.max(
                      0,
                      ((effectiveDayLength - dayDowntime) /
                          effectiveDayLength) *
                          100
                  )
                : 100;

        const dateStr = new Date(dayStartSec * 1000).toISOString().slice(0, 10);

        let status: DayBucket["status"] = "no_data";
        if (currentStatus !== null || dayEvents.length > 0) {
            if (uptimePct >= 99) status = "good";
            else if (uptimePct >= 50) status = "degraded";
            else status = "bad";
        }

        buckets.push({
            date: dateStr,
            uptimePercent: Math.round(uptimePct * 100) / 100,
            totalDowntimeSeconds: dayDowntime,
            downtimeWindows: windows,
            status,
        });
    }

    return { buckets, totalDowntime };
}

export async function getSiteStatusHistory(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = siteParamsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }
        const parsedQuery = querySchema.safeParse(req.query);
        if (!parsedQuery.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedQuery.error).toString()
                )
            );
        }

        const entityType = "site";
        const entityId = parsedParams.data.siteId;
        const { days } = parsedQuery.data;

        const nowSec = Math.floor(Date.now() / 1000);
        const startSec = nowSec - days * 86400;

        const events = await db
            .select()
            .from(statusHistory)
            .where(
                and(
                    eq(statusHistory.entityType, entityType),
                    eq(statusHistory.entityId, entityId),
                    gte(statusHistory.timestamp, startSec)
                )
            )
            .orderBy(asc(statusHistory.timestamp));

        const { buckets, totalDowntime } = computeBuckets(events, days);
        const totalWindow = days * 86400;
        const overallUptime =
            totalWindow > 0
                ? Math.max(
                      0,
                      ((totalWindow - totalDowntime) / totalWindow) * 100
                  )
                : 100;

        return response<StatusHistoryResponse>(res, {
            data: {
                entityType,
                entityId,
                days: buckets,
                overallUptimePercent: Math.round(overallUptime * 100) / 100,
                totalDowntimeSeconds: totalDowntime,
            },
            success: true,
            error: false,
            message: "Status history retrieved successfully",
            status: HttpCode.OK,
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "An error occurred"
            )
        );
    }
}

export async function getHealthCheckStatusHistory(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = healthCheckParamsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }
        const parsedQuery = querySchema.safeParse(req.query);
        if (!parsedQuery.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedQuery.error).toString()
                )
            );
        }

        const entityType = "healthCheck";
        const entityId = parsedParams.data.targetHealthCheckId;
        const { days } = parsedQuery.data;

        const nowSec = Math.floor(Date.now() / 1000);
        const startSec = nowSec - days * 86400;

        const events = await db
            .select()
            .from(statusHistory)
            .where(
                and(
                    eq(statusHistory.entityType, entityType),
                    eq(statusHistory.entityId, entityId),
                    gte(statusHistory.timestamp, startSec)
                )
            )
            .orderBy(asc(statusHistory.timestamp));

        const { buckets, totalDowntime } = computeBuckets(events, days);
        const totalWindow = days * 86400;
        const overallUptime =
            totalWindow > 0
                ? Math.max(
                      0,
                      ((totalWindow - totalDowntime) / totalWindow) * 100
                  )
                : 100;

        return response<StatusHistoryResponse>(res, {
            data: {
                entityType,
                entityId,
                days: buckets,
                overallUptimePercent: Math.round(overallUptime * 100) / 100,
                totalDowntimeSeconds: totalDowntime,
            },
            success: true,
            error: false,
            message: "Status history retrieved successfully",
            status: HttpCode.OK,
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "An error occurred"
            )
        );
    }
}