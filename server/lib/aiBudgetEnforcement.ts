import { and, eq, gte, inArray, isNull, or, sql, SQL } from "drizzle-orm";
import {
    AiBudget,
    aiBudgetBreachEvents,
    aiBudgets,
    aiModels,
    aiUsageRecords,
    db,
    userOrgRoles
} from "@server/db";
import { modelKeyMatches } from "@server/lib/aiModelKeyMatch";
import type { AiUsage } from "@server/lib/aiUsageExtraction";
import logger from "@server/logger";

type BudgetPeriod = AiBudget["period"];

const PERIOD_DURATIONS_MS: Record<Exclude<BudgetPeriod, "lifetime">, number> = {
    hourly: 60 * 60 * 1000,
    daily: 24 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000,
    monthly: 30 * 24 * 60 * 60 * 1000,
    yearly: 365 * 24 * 60 * 60 * 1000
};

// Budget periods are trailing windows from "now", not calendar-aligned
// (e.g. "daily" = last 24h). "lifetime" has no lower bound.
function windowStart(period: BudgetPeriod, now: number): number {
    if (period === "lifetime") {
        return 0;
    }
    return now - PERIOD_DURATIONS_MS[period];
}

export type BudgetScopeContext = {
    orgId: string;
    providerId: number;
    requestedModel: string;
    resourceId: number | null;
    siteResourceId: number | null;
    roleIds: number[];
    requestUserId: string | null;
};

/**
 * Every budget that could apply to this request: the provider itself, any
 * model on that provider whose (possibly wildcarded) modelKey matches the
 * requested model, the target resource/site-resource, and any role the
 * requesting user holds in the org.
 */
export async function resolveApplicableBudgets(
    ctx: BudgetScopeContext
): Promise<AiBudget[]> {
    const providerModels = await db
        .select({ modelId: aiModels.modelId, modelKey: aiModels.modelKey })
        .from(aiModels)
        .where(
            and(
                eq(aiModels.providerId, ctx.providerId),
                eq(aiModels.enabled, true)
            )
        );

    const matchingModelIds = providerModels
        .filter((m) => modelKeyMatches(m.modelKey, ctx.requestedModel))
        .map((m) => m.modelId);

    const scopeConditions: SQL[] = [
        and(
            eq(aiBudgets.providerId, ctx.providerId),
            isNull(aiBudgets.modelId)
        )!
    ];
    if (matchingModelIds.length > 0) {
        scopeConditions.push(inArray(aiBudgets.modelId, matchingModelIds));
    }
    if (ctx.resourceId != null) {
        scopeConditions.push(eq(aiBudgets.resourceId, ctx.resourceId));
    }
    if (ctx.siteResourceId != null) {
        scopeConditions.push(eq(aiBudgets.siteResourceId, ctx.siteResourceId));
    }
    if (ctx.roleIds.length > 0) {
        scopeConditions.push(inArray(aiBudgets.roleId, ctx.roleIds));
    }

    return db
        .select()
        .from(aiBudgets)
        .where(
            and(
                eq(aiBudgets.orgId, ctx.orgId),
                eq(aiBudgets.enabled, true),
                or(...scopeConditions)
            )
        );
}

async function sumUsageAmount(
    where: SQL,
    unit: AiBudget["unit"]
): Promise<number> {
    const column =
        unit === "usd" ? aiUsageRecords.costUsd : aiUsageRecords.totalTokens;
    const [row] = await db
        .select({ total: sql<number>`coalesce(sum(${column}), 0)` })
        .from(aiUsageRecords)
        .where(where);
    return Number(row?.total ?? 0);
}

/**
 * Sums recorded usage for a single budget's scope + rolling window. Model
 * budgets can't be pushed down to SQL because the model's key may itself be
 * a glob, so those rows are fetched for the provider+window and matched in
 * JS the same way access-control matching does.
 */
export async function sumUsageForBudget(
    budget: AiBudget,
    ctx: BudgetScopeContext,
    now: number
): Promise<number> {
    const start = windowStart(budget.period, now);

    if (budget.modelId != null) {
        const [model] = await db
            .select({
                providerId: aiModels.providerId,
                modelKey: aiModels.modelKey
            })
            .from(aiModels)
            .where(eq(aiModels.modelId, budget.modelId))
            .limit(1);
        if (!model) {
            return 0;
        }
        const rows = await db
            .select({
                requestedModel: aiUsageRecords.requestedModel,
                costUsd: aiUsageRecords.costUsd,
                totalTokens: aiUsageRecords.totalTokens
            })
            .from(aiUsageRecords)
            .where(
                and(
                    eq(aiUsageRecords.orgId, ctx.orgId),
                    eq(aiUsageRecords.providerId, model.providerId),
                    gte(aiUsageRecords.createdAt, start)
                )
            );
        return rows
            .filter((r) => modelKeyMatches(model.modelKey, r.requestedModel))
            .reduce(
                (sum, r) =>
                    sum +
                    (budget.unit === "usd" ? (r.costUsd ?? 0) : r.totalTokens),
                0
            );
    }

    if (budget.providerId != null) {
        return sumUsageAmount(
            and(
                eq(aiUsageRecords.orgId, ctx.orgId),
                eq(aiUsageRecords.providerId, budget.providerId),
                gte(aiUsageRecords.createdAt, start)
            )!,
            budget.unit
        );
    }

    if (budget.resourceId != null) {
        return sumUsageAmount(
            and(
                eq(aiUsageRecords.orgId, ctx.orgId),
                eq(aiUsageRecords.resourceId, budget.resourceId),
                gte(aiUsageRecords.createdAt, start)
            )!,
            budget.unit
        );
    }

    if (budget.siteResourceId != null) {
        return sumUsageAmount(
            and(
                eq(aiUsageRecords.orgId, ctx.orgId),
                eq(aiUsageRecords.siteResourceId, budget.siteResourceId),
                gte(aiUsageRecords.createdAt, start)
            )!,
            budget.unit
        );
    }

    if (budget.roleId != null) {
        const members = await db
            .select({ userId: userOrgRoles.userId })
            .from(userOrgRoles)
            .where(
                and(
                    eq(userOrgRoles.roleId, budget.roleId),
                    eq(userOrgRoles.orgId, ctx.orgId)
                )
            );
        const userIds = members.map((m) => m.userId);
        if (userIds.length === 0) {
            return 0;
        }
        return sumUsageAmount(
            and(
                eq(aiUsageRecords.orgId, ctx.orgId),
                inArray(aiUsageRecords.userId, userIds),
                gte(aiUsageRecords.createdAt, start)
            )!,
            budget.unit
        );
    }

    return 0;
}

// Throttled to one durable event per budget per breach window, so a soft
// budget being exceeded doesn't write a row on every subsequent request
// while it stays over.
async function recordBreachEventIfNew(
    budget: AiBudget,
    ctx: BudgetScopeContext,
    usageAmount: number,
    now: number
): Promise<void> {
    try {
        const start = windowStart(budget.period, now);
        const [existing] = await db
            .select({ id: aiBudgetBreachEvents.id })
            .from(aiBudgetBreachEvents)
            .where(
                and(
                    eq(aiBudgetBreachEvents.budgetId, budget.budgetId),
                    gte(aiBudgetBreachEvents.createdAt, start)
                )
            )
            .limit(1);
        if (existing) {
            return;
        }

        await db.insert(aiBudgetBreachEvents).values({
            orgId: ctx.orgId,
            budgetId: budget.budgetId,
            enforcement: budget.enforcement,
            unit: budget.unit,
            period: budget.period,
            amount: budget.amount,
            usageAmount,
            blocked: budget.enforcement === "hard",
            requestUserId: ctx.requestUserId,
            createdAt: now
        });
    } catch (error) {
        logger.error("Failed to record AI budget breach event", {
            error,
            budgetId: budget.budgetId
        });
    }
}

export type BudgetCheckResult = {
    blocked: boolean;
    blockingBudget?: AiBudget;
};

export async function checkBudgets(
    ctx: BudgetScopeContext
): Promise<BudgetCheckResult> {
    const budgets = await resolveApplicableBudgets(ctx);
    if (budgets.length === 0) {
        return { blocked: false };
    }

    const now = Date.now();
    let blockingBudget: AiBudget | undefined;

    for (const budget of budgets) {
        const usage = await sumUsageForBudget(budget, ctx, now);
        if (usage < budget.amount) {
            continue;
        }

        await recordBreachEventIfNew(budget, ctx, usage, now);

        if (budget.enforcement === "hard" && !blockingBudget) {
            blockingBudget = budget;
        }
    }

    return blockingBudget
        ? { blocked: true, blockingBudget }
        : { blocked: false };
}

export type UsageRecordInput = {
    orgId: string;
    providerId: number;
    resourceId: number | null;
    siteResourceId: number | null;
    userId: string | null;
    requestedModel: string;
    usage: AiUsage;
    costUsd: number | null;
    createdAt?: number;
};

export async function recordUsage(input: UsageRecordInput): Promise<void> {
    try {
        const { usage } = input;
        const totalTokens =
            usage.promptTokens +
            usage.cacheReadTokens +
            usage.cacheWriteTokens +
            usage.completionTokens +
            usage.reasoningTokens;

        await db.insert(aiUsageRecords).values({
            orgId: input.orgId,
            providerId: input.providerId,
            resourceId: input.resourceId,
            siteResourceId: input.siteResourceId,
            userId: input.userId,
            requestedModel: input.requestedModel,
            promptTokens: usage.promptTokens,
            cacheReadTokens: usage.cacheReadTokens,
            cacheWriteTokens: usage.cacheWriteTokens,
            completionTokens: usage.completionTokens,
            reasoningTokens: usage.reasoningTokens,
            totalTokens,
            costUsd: input.costUsd,
            estimated: usage.estimated,
            createdAt: input.createdAt ?? Date.now()
        });
    } catch (error) {
        logger.error("Failed to record AI usage", { error });
    }
}
