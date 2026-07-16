import { z } from "zod";
import { db, logsDb, statusHistory } from "@server/db";
import { and, eq, gte, lt, asc, desc } from "drizzle-orm";
import { regionalCache as cache } from "#dynamic/lib/cache";

const STATUS_HISTORY_CACHE_TTL = 60; // seconds

function statusHistoryCacheKey(
    entityType: string,
    entityId: number,
    days: number,
    tzOffsetMinutes: number
): string {
    return `statusHistory:${entityType}:${entityId}:${days}:${tzOffsetMinutes}`;
}

// Returns the epoch seconds of the most recent local-calendar-day midnight,
// where "local" is defined by tzOffsetMinutes (minutes to ADD to UTC to get
// local time, e.g. Australia/Sydney standard time is 600). Defaults to 0
// (UTC) so callers that don't pass a timezone keep the original behavior.
function localMidnightSec(tzOffsetMinutes: number): number {
    const localNow = new Date(Date.now() + tzOffsetMinutes * 60_000);
    localNow.setUTCHours(0, 0, 0, 0);
    return Math.floor(localNow.getTime() / 1000) - tzOffsetMinutes * 60;
}

export async function getCachedStatusHistory(
    entityType: string,
    entityId: number,
    days: number,
    tzOffsetMinutes: number = 0
): Promise<StatusHistoryResponse> {
    const cacheKey = statusHistoryCacheKey(
        entityType,
        entityId,
        days,
        tzOffsetMinutes
    );
    const cached = await cache.get<StatusHistoryResponse>(cacheKey);
    if (cached !== undefined) {
        return cached;
    }

    // Anchor to local midnight (UTC when tzOffsetMinutes is 0) so the query
    // window aligns with stable calendar days for the requesting client
    const todayMidnightSec = localMidnightSec(tzOffsetMinutes);
    const startSec = todayMidnightSec - days * 86400;

    const events = await logsDb
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

    // Fetch the last known state before the window so that entities that
    // haven't changed status recently still show the correct status rather
    // than appearing as "no_data".
    const [lastKnownEvent] = await logsDb
        .select()
        .from(statusHistory)
        .where(
            and(
                eq(statusHistory.entityType, entityType),
                eq(statusHistory.entityId, entityId),
                lt(statusHistory.timestamp, startSec)
            )
        )
        .orderBy(desc(statusHistory.timestamp))
        .limit(1);

    const priorStatus = lastKnownEvent?.status ?? null;

    const { buckets, totalDowntime } = computeBuckets(
        events,
        days,
        priorStatus,
        tzOffsetMinutes
    );
    const totalWindow = days * 86400;
    const overallUptime =
        totalWindow > 0
            ? Math.max(0, ((totalWindow - totalDowntime) / totalWindow) * 100)
            : 100;

    const result: StatusHistoryResponse = {
        entityType,
        entityId,
        days: buckets,
        overallUptimePercent: Math.round(overallUptime * 100) / 100,
        totalDowntimeSeconds: totalDowntime
    };

    await cache.set(cacheKey, result, STATUS_HISTORY_CACHE_TTL);
    return result;
}

export async function invalidateStatusHistoryCache(
    entityType: string,
    entityId: number
): Promise<void> {
    const prefix = `statusHistory:${entityType}:${entityId}:`;
    const keys = await cache.keysWithPrefix(prefix);
    if (keys.length > 0) {
        await cache.del(keys);
    }
}

export const statusHistoryQuerySchema = z
    .object({
        days: z
            .string()
            .optional()
            .transform((v) => (v ? parseInt(v, 10) : 90)),
        // Minutes to add to UTC to get the requesting client's local time
        // (e.g. Australia/Sydney standard time is 600). Optional and
        // defaults to 0 (UTC) so older clients keep the prior behavior.
        tzOffsetMinutes: z
            .string()
            .optional()
            .transform((v) => (v ? parseInt(v, 10) : 0))
    })
    .pipe(
        z.object({
            days: z.number().int().min(1).max(365),
            tzOffsetMinutes: z.number().int().min(-720).max(840)
        })
    );

export interface StatusHistoryDayBucket {
    date: string; // ISO date "YYYY-MM-DD"
    uptimePercent: number; // 0-100
    totalDowntimeSeconds: number;
    downtimeWindows: { start: number; end: number | null; status: string }[];
    status: "good" | "degraded" | "bad" | "no_data" | "unknown";
}

export interface StatusHistoryResponse {
    entityType: string;
    entityId: number;
    days: StatusHistoryDayBucket[];
    overallUptimePercent: number;
    totalDowntimeSeconds: number;
}

export function computeBuckets(
    events: {
        entityType: string;
        entityId: number;
        orgId: string;
        status: string;
        timestamp: number;
        id: number;
    }[],
    days: number,
    priorStatus: string | null = null,
    tzOffsetMinutes: number = 0
): { buckets: StatusHistoryDayBucket[]; totalDowntime: number } {
    const nowSec = Math.floor(Date.now() / 1000);

    // Anchor bucket boundaries to local midnight (UTC when tzOffsetMinutes is
    // 0) so dates are stable calendar days for the requesting client and
    // don't drift as the cache expires and is recomputed
    const todayMidnightSec = localMidnightSec(tzOffsetMinutes);

    const buckets: StatusHistoryDayBucket[] = [];
    let totalDowntime = 0;

    for (let d = 0; d < days; d++) {
        const dayStartSec = todayMidnightSec - (days - 1 - d) * 86400;
        const dayEndSec = dayStartSec + 86400;

        const dayEvents = events.filter(
            (e) => e.timestamp >= dayStartSec && e.timestamp < dayEndSec
        );

        // Determine the status at the start of this day (last event before dayStart)
        const lastBeforeDay = [...events]
            .filter((e) => e.timestamp < dayStartSec)
            .at(-1);

        // Fall back to the last known state before the entire query window
        // so that entities that haven't generated events recently still show
        // as their actual status rather than "no_data".
        const currentStatus = lastBeforeDay?.status ?? priorStatus ?? null;

        const windows: { start: number; end: number | null; status: string }[] =
            [];
        let dayDowntime = 0;
        let dayDegradedTime = 0;

        let windowStart = dayStartSec;
        let windowStatus = currentStatus;

        for (const evt of dayEvents) {
            if (windowStatus !== null && windowStatus !== evt.status) {
                const windowEnd = evt.timestamp;
                const isDown =
                    windowStatus === "offline" || windowStatus === "unhealthy";
                const isDegraded = windowStatus === "degraded";
                if (isDown) {
                    dayDowntime += windowEnd - windowStart;
                    windows.push({
                        start: windowStart,
                        end: windowEnd,
                        status: windowStatus
                    });
                } else if (isDegraded) {
                    dayDegradedTime += windowEnd - windowStart;
                    windows.push({
                        start: windowStart,
                        end: windowEnd,
                        status: windowStatus
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
                windowStatus === "offline" || windowStatus === "unhealthy";
            const isDegraded = windowStatus === "degraded";
            if (isDown && finalEnd > windowStart) {
                dayDowntime += finalEnd - windowStart;
                windows.push({
                    start: windowStart,
                    end: finalEnd,
                    status: windowStatus
                });
            } else if (isDegraded && finalEnd > windowStart) {
                dayDegradedTime += finalEnd - windowStart;
                windows.push({
                    start: windowStart,
                    end: finalEnd,
                    status: windowStatus
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
                      ((effectiveDayLength - dayDowntime - dayDegradedTime) /
                          effectiveDayLength) *
                          100
                  )
                : 100;

        // Shift by the client's offset before formatting so the label reflects
        // their local calendar date rather than the UTC date of dayStartSec
        const dateStr = new Date(
            (dayStartSec + tzOffsetMinutes * 60) * 1000
        )
            .toISOString()
            .slice(0, 10);

        const hasAnyData = currentStatus !== null || dayEvents.length > 0;

        // The whole observable window is "unknown" if every status we have seen is unknown
        const allStatuses = [
            ...(currentStatus !== null ? [currentStatus] : []),
            ...dayEvents.map((e) => e.status)
        ];
        const onlyUnknownData =
            hasAnyData && allStatuses.every((s) => s === "unknown");

        let status: StatusHistoryDayBucket["status"] = "no_data";
        if (hasAnyData) {
            if (onlyUnknownData) {
                status = "unknown";
            } else if (dayDowntime > 0 && uptimePct < 50) {
                status = "bad";
            } else if (dayDowntime > 0 || dayDegradedTime > 0) {
                status = "degraded";
            } else {
                status = "good";
            }
        }

        buckets.push({
            date: dateStr,
            uptimePercent: Math.round(uptimePct * 100) / 100,
            totalDowntimeSeconds: dayDowntime,
            downtimeWindows: windows,
            status
        });
    }

    return { buckets, totalDowntime };
}
