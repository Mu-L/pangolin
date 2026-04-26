import { z } from "zod";

export const statusHistoryQuerySchema = z
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
    events: { entityType: string; entityId: number; orgId: string; status: string; timestamp: number; id: number }[],
    days: number
): { buckets: StatusHistoryDayBucket[]; totalDowntime: number } {
    const nowSec = Math.floor(Date.now() / 1000);
    const buckets: StatusHistoryDayBucket[] = [];
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

        const currentStatus = lastBeforeDay?.status ?? null;

        const windows: { start: number; end: number | null; status: string }[] = [];
        let dayDowntime = 0;
        let dayDegradedTime = 0;

        let windowStart = dayStartSec;
        let windowStatus = currentStatus;

        for (const evt of dayEvents) {
            if (windowStatus !== null && windowStatus !== evt.status) {
                const windowEnd = evt.timestamp;
                const isDown =
                    windowStatus === "offline" ||
                    windowStatus === "unhealthy";
                const isDegraded = windowStatus === "degraded";
                if (isDown) {
                    dayDowntime += windowEnd - windowStart;
                    windows.push({
                        start: windowStart,
                        end: windowEnd,
                        status: windowStatus,
                    });
                } else if (isDegraded) {
                    dayDegradedTime += windowEnd - windowStart;
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
                windowStatus === "unhealthy";
            const isDegraded = windowStatus === "degraded";
            if (isDown && finalEnd > windowStart) {
                dayDowntime += finalEnd - windowStart;
                windows.push({
                    start: windowStart,
                    end: finalEnd,
                    status: windowStatus,
                });
            } else if (isDegraded && finalEnd > windowStart) {
                dayDegradedTime += finalEnd - windowStart;
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
                      ((effectiveDayLength - dayDowntime - dayDegradedTime) /
                          effectiveDayLength) *
                          100
                  )
                : 100;

        const dateStr = new Date(dayStartSec * 1000).toISOString().slice(0, 10);

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
            status,
        });
    }

    return { buckets, totalDowntime };
}
