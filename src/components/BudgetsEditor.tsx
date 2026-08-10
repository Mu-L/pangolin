"use client";

import {
    SettingsSection,
    SettingsSectionBody,
    SettingsSectionDescription,
    SettingsSectionFooter,
    SettingsSectionHeader,
    SettingsSectionTitle
} from "@app/components/Settings";
import { Button } from "@app/components/ui/button";
import { Input } from "@app/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@app/components/ui/select";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { toast } from "@app/hooks/useToast";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import {
    AI_BUDGET_PERIODS,
    AI_BUDGET_UNITS,
    getAiBudgetScopeBodyField,
    type AiBudgetPeriod,
    type AiBudgetScope,
    type AiBudgetUnit
} from "@app/lib/aiBudgetScope";
import { aiBudgetQueries } from "@app/lib/queries";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AiBudget } from "@server/db";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

type BudgetRow = {
    key: string;
    budgetId?: number;
    amount: string;
    unit: AiBudgetUnit;
    period: AiBudgetPeriod;
};

function rowsFromBudgets(budgets: AiBudget[]): BudgetRow[] {
    return budgets.map((budget) => ({
        key: String(budget.budgetId),
        budgetId: budget.budgetId,
        amount: String(budget.amount),
        unit: budget.unit,
        period: budget.period
    }));
}

function comboKey(unit: AiBudgetUnit, period: AiBudgetPeriod): string {
    return `${unit}:${period}`;
}

function nextAvailableCombo(rows: BudgetRow[]): {
    unit: AiBudgetUnit;
    period: AiBudgetPeriod;
} {
    const used = new Set(rows.map((row) => comboKey(row.unit, row.period)));
    for (const unit of AI_BUDGET_UNITS) {
        for (const period of AI_BUDGET_PERIODS) {
            if (!used.has(comboKey(unit, period))) {
                return { unit, period };
            }
        }
    }
    return { unit: "usd", period: "monthly" };
}

export function BudgetsEditor({
    scope,
    orgId,
    title,
    description
}: {
    scope: AiBudgetScope;
    orgId: string;
    title: string;
    description: string;
}) {
    const { env } = useEnvContext();
    const api = createApiClient({ env });
    const queryClient = useQueryClient();
    const t = useTranslations();

    const [rows, setRows] = useState<BudgetRow[]>([]);
    const [saveLoading, setSaveLoading] = useState(false);
    const [attemptedSave, setAttemptedSave] = useState(false);

    const budgetsQuery = useQuery(aiBudgetQueries.scoped({ scope }));

    useEffect(() => {
        if (!budgetsQuery.data) return;
        setRows(rowsFromBudgets(budgetsQuery.data));
        setAttemptedSave(false);
    }, [budgetsQuery.data]);

    const conflictingKeys = useMemo(() => {
        const counts = new Map<string, number>();
        for (const row of rows) {
            const key = comboKey(row.unit, row.period);
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        const conflicting = new Set<string>();
        for (const row of rows) {
            const key = comboKey(row.unit, row.period);
            if ((counts.get(key) ?? 0) > 1) {
                conflicting.add(row.key);
            }
        }
        return conflicting;
    }, [rows]);

    const invalidAmountKeys = useMemo(() => {
        const invalid = new Set<string>();
        for (const row of rows) {
            const amount = Number(row.amount);
            if (!row.amount.trim() || !Number.isFinite(amount) || amount <= 0) {
                invalid.add(row.key);
            }
        }
        return invalid;
    }, [rows]);

    const hasErrors = conflictingKeys.size > 0 || invalidAmountKeys.size > 0;

    function addRow() {
        const combo = nextAvailableCombo(rows);
        setRows((prev) => [
            ...prev,
            {
                key: crypto.randomUUID(),
                amount: "",
                unit: combo.unit,
                period: combo.period
            }
        ]);
    }

    function removeRow(key: string) {
        setRows((prev) => prev.filter((row) => row.key !== key));
    }

    function updateRow(key: string, patch: Partial<BudgetRow>) {
        setRows((prev) =>
            prev.map((row) => (row.key === key ? { ...row, ...patch } : row))
        );
    }

    async function onSave() {
        setAttemptedSave(true);
        if (hasErrors) {
            toast({
                variant: "destructive",
                title: t("aiBudgetErrorSave"),
                description: conflictingKeys.size
                    ? t("aiBudgetConflictError")
                    : t("aiBudgetInvalidAmountError")
            });
            return;
        }

        setSaveLoading(true);
        try {
            const existing = budgetsQuery.data ?? [];
            const existingById = new Map(
                existing.map((budget) => [budget.budgetId, budget])
            );
            const currentBudgetIds = new Set(
                rows
                    .filter((row) => row.budgetId !== undefined)
                    .map((row) => row.budgetId as number)
            );
            const bodyField = getAiBudgetScopeBodyField(scope);

            const toDelete = existing.filter(
                (budget) => !currentBudgetIds.has(budget.budgetId)
            );
            const toCreate = rows.filter((row) => row.budgetId === undefined);
            const toUpdate = rows.filter((row) => {
                if (row.budgetId === undefined) return false;
                const existingBudget = existingById.get(row.budgetId);
                if (!existingBudget) return false;
                return (
                    existingBudget.amount !== Number(row.amount) ||
                    existingBudget.unit !== row.unit ||
                    existingBudget.period !== row.period
                );
            });

            await Promise.all([
                ...toDelete.map((budget) =>
                    api.delete(`/ai-budget/${budget.budgetId}`)
                ),
                ...toCreate.map((row) =>
                    api.put(`/org/${orgId}/ai-budget`, {
                        [bodyField]: scope.id,
                        amount: Number(row.amount),
                        unit: row.unit,
                        period: row.period
                    })
                ),
                ...toUpdate.map((row) =>
                    api.post(`/ai-budget/${row.budgetId}`, {
                        amount: Number(row.amount),
                        unit: row.unit,
                        period: row.period
                    })
                )
            ]);

            await queryClient.invalidateQueries(
                aiBudgetQueries.scoped({ scope })
            );

            toast({
                title: t("success"),
                description: t("aiBudgetUpdated")
            });
        } catch (e) {
            toast({
                variant: "destructive",
                title: t("aiBudgetErrorSave"),
                description: formatAxiosError(e, t("aiBudgetErrorSave"))
            });
        } finally {
            setSaveLoading(false);
        }
    }

    const periodLabels: Record<AiBudgetPeriod, string> = {
        hourly: t("aiBudgetPeriodHourly"),
        daily: t("aiBudgetPeriodDaily"),
        weekly: t("aiBudgetPeriodWeekly"),
        monthly: t("aiBudgetPeriodMonthly"),
        yearly: t("aiBudgetPeriodYearly"),
        lifetime: t("aiBudgetPeriodLifetime")
    };

    const unitLabels: Record<AiBudgetUnit, string> = {
        usd: t("aiBudgetUnitUsd"),
        tokens: t("aiBudgetUnitTokens")
    };

    return (
        <SettingsSection>
            <SettingsSectionHeader>
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-0.5">
                        <SettingsSectionTitle>{title}</SettingsSectionTitle>
                        <SettingsSectionDescription>
                            {description}
                        </SettingsSectionDescription>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addRow}
                        disabled={budgetsQuery.isLoading}
                        className="shrink-0"
                    >
                        <Plus className="h-4 w-4 mr-1" />
                        {t("aiBudgetAdd")}
                    </Button>
                </div>
            </SettingsSectionHeader>

            <SettingsSectionBody>
                {rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        {t("aiBudgetEmpty")}
                    </p>
                ) : (
                    <div className="space-y-3">
                        {rows.map((row) => {
                            const showConflict = conflictingKeys.has(row.key);
                            const showInvalidAmount =
                                attemptedSave &&
                                invalidAmountKeys.has(row.key);
                            return (
                                <div key={row.key} className="space-y-1">
                                    <div className="flex items-start gap-2">
                                        <Input
                                            type="number"
                                            min="0"
                                            step="any"
                                            placeholder={t(
                                                "aiBudgetAmountPlaceholder"
                                            )}
                                            value={row.amount}
                                            aria-invalid={showInvalidAmount}
                                            disabled={
                                                saveLoading ||
                                                budgetsQuery.isLoading
                                            }
                                            onChange={(e) =>
                                                updateRow(row.key, {
                                                    amount: e.target.value
                                                })
                                            }
                                            className="flex-1"
                                        />
                                        <Select
                                            value={row.period}
                                            onValueChange={(value) =>
                                                updateRow(row.key, {
                                                    period: value as AiBudgetPeriod
                                                })
                                            }
                                            disabled={
                                                saveLoading ||
                                                budgetsQuery.isLoading
                                            }
                                        >
                                            <SelectTrigger
                                                className="w-44 shrink-0"
                                                aria-invalid={showConflict}
                                            >
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {AI_BUDGET_PERIODS.map(
                                                    (period) => (
                                                        <SelectItem
                                                            key={period}
                                                            value={period}
                                                        >
                                                            {
                                                                periodLabels[
                                                                    period
                                                                ]
                                                            }
                                                        </SelectItem>
                                                    )
                                                )}
                                            </SelectContent>
                                        </Select>
                                        <Select
                                            value={row.unit}
                                            onValueChange={(value) =>
                                                updateRow(row.key, {
                                                    unit: value as AiBudgetUnit
                                                })
                                            }
                                            disabled={
                                                saveLoading ||
                                                budgetsQuery.isLoading
                                            }
                                        >
                                            <SelectTrigger
                                                className="w-32 shrink-0"
                                                aria-invalid={showConflict}
                                            >
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {AI_BUDGET_UNITS.map(
                                                    (unit) => (
                                                        <SelectItem
                                                            key={unit}
                                                            value={unit}
                                                        >
                                                            {unitLabels[unit]}
                                                        </SelectItem>
                                                    )
                                                )}
                                            </SelectContent>
                                        </Select>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="shrink-0"
                                            disabled={
                                                saveLoading ||
                                                budgetsQuery.isLoading
                                            }
                                            onClick={() => removeRow(row.key)}
                                        >
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                    </div>
                                    {showConflict && (
                                        <p className="text-xs text-destructive">
                                            {t("aiBudgetConflictError")}
                                        </p>
                                    )}
                                    {showInvalidAmount && (
                                        <p className="text-xs text-destructive">
                                            {t("aiBudgetInvalidAmountError")}
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </SettingsSectionBody>

            <SettingsSectionFooter>
                <Button
                    type="button"
                    loading={saveLoading}
                    disabled={saveLoading || budgetsQuery.isLoading}
                    onClick={onSave}
                >
                    {t("saveSettings")}
                </Button>
            </SettingsSectionFooter>
        </SettingsSection>
    );
}
