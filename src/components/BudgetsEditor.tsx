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
import { DataTableEmptyState } from "@app/components/ui/data-table-empty-state";
import { Input } from "@app/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@app/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@app/components/ui/table";
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
import type { AxiosInstance } from "axios";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

export type BudgetRow = {
    key: string;
    budgetId?: number;
    amount: string;
    unit: AiBudgetUnit;
    period: AiBudgetPeriod;
};

export function rowsFromBudgets(budgets: AiBudget[]): BudgetRow[] {
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

function newRowKey(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
    }
    return `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function newBudgetRow(rows: BudgetRow[]): BudgetRow {
    const combo = nextAvailableCombo(rows);
    return {
        key: newRowKey(),
        amount: "",
        unit: combo.unit,
        period: combo.period
    };
}

export function getBudgetRowsErrors(rows: BudgetRow[]): {
    conflictingKeys: Set<string>;
    invalidAmountKeys: Set<string>;
} {
    const counts = new Map<string, number>();
    for (const row of rows) {
        const key = comboKey(row.unit, row.period);
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const conflictingKeys = new Set<string>();
    for (const row of rows) {
        const key = comboKey(row.unit, row.period);
        if ((counts.get(key) ?? 0) > 1) {
            conflictingKeys.add(row.key);
        }
    }

    const invalidAmountKeys = new Set<string>();
    for (const row of rows) {
        const amount = Number(row.amount);
        if (!row.amount.trim() || !Number.isFinite(amount) || amount <= 0) {
            invalidAmountKeys.add(row.key);
        }
    }

    return { conflictingKeys, invalidAmountKeys };
}

export function BudgetRowsFields({
    rows,
    onChange,
    disabled = false,
    attemptedSave = false
}: {
    rows: BudgetRow[];
    onChange: (rows: BudgetRow[]) => void;
    disabled?: boolean;
    attemptedSave?: boolean;
}) {
    const t = useTranslations();

    const { conflictingKeys, invalidAmountKeys } = useMemo(
        () => getBudgetRowsErrors(rows),
        [rows]
    );

    function addRow() {
        onChange([...rows, newBudgetRow(rows)]);
    }

    function removeRow(key: string) {
        onChange(rows.filter((row) => row.key !== key));
    }

    function updateRow(key: string, patch: Partial<BudgetRow>) {
        onChange(
            rows.map((row) => (row.key === key ? { ...row, ...patch } : row))
        );
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

    const addRowButton = (
        <Button
            type="button"
            variant="outline"
            onClick={addRow}
            disabled={disabled}
        >
            <Plus className="h-4 w-4 mr-2" />
            {t("aiBudgetAdd")}
        </Button>
    );

    return (
        <div className="space-y-4">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>{t("aiBudgetAmount")}</TableHead>
                        <TableHead>{t("aiBudgetUnit")}</TableHead>
                        <TableHead>{t("aiBudgetPeriod")}</TableHead>
                        <TableHead></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.length === 0 ? (
                        <DataTableEmptyState
                            colSpan={4}
                            message={t("aiBudgetEmpty")}
                            action={addRowButton}
                            compact
                        />
                    ) : (
                        rows.map((row) => {
                            const showConflict = conflictingKeys.has(row.key);
                            const showInvalidAmount =
                                attemptedSave &&
                                invalidAmountKeys.has(row.key);
                            return (
                                <TableRow key={row.key}>
                                    <TableCell>
                                        <Input
                                            type="number"
                                            min="0"
                                            step="any"
                                            placeholder={t(
                                                "aiBudgetAmountPlaceholder"
                                            )}
                                            value={row.amount}
                                            aria-invalid={showInvalidAmount}
                                            disabled={disabled}
                                            onChange={(e) =>
                                                updateRow(row.key, {
                                                    amount: e.target.value
                                                })
                                            }
                                            className="w-full min-w-0"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Select
                                            value={row.unit}
                                            onValueChange={(value) =>
                                                updateRow(row.key, {
                                                    unit: value as AiBudgetUnit
                                                })
                                            }
                                            disabled={disabled}
                                        >
                                            <SelectTrigger
                                                className="w-full min-w-0"
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
                                                            {
                                                                unitLabels[
                                                                    unit
                                                                ]
                                                            }
                                                        </SelectItem>
                                                    )
                                                )}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell>
                                        <Select
                                            value={row.period}
                                            onValueChange={(value) =>
                                                updateRow(row.key, {
                                                    period: value as AiBudgetPeriod
                                                })
                                            }
                                            disabled={disabled}
                                        >
                                            <SelectTrigger
                                                className="w-full min-w-0"
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
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center justify-end space-x-2">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                disabled={disabled}
                                                onClick={() =>
                                                    removeRow(row.key)
                                                }
                                            >
                                                Delete
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );
                        })
                    )}
                </TableBody>
            </Table>
            {(conflictingKeys.size > 0 ||
                (attemptedSave && invalidAmountKeys.size > 0)) && (
                <p className="text-xs text-destructive">
                    {conflictingKeys.size > 0
                        ? t("aiBudgetConflictError")
                        : t("aiBudgetInvalidAmountError")}
                </p>
            )}
            {rows.length > 0 && addRowButton}
        </div>
    );
}

export async function saveBudgetRows({
    api,
    orgId,
    scope,
    existingBudgets,
    rows
}: {
    api: AxiosInstance;
    orgId: string;
    scope: AiBudgetScope;
    existingBudgets: AiBudget[];
    rows: Pick<BudgetRow, "budgetId" | "amount" | "unit" | "period">[];
}): Promise<void> {
    const existingById = new Map(
        existingBudgets.map((budget) => [budget.budgetId, budget])
    );
    const currentBudgetIds = new Set(
        rows
            .filter((row) => row.budgetId !== undefined)
            .map((row) => row.budgetId as number)
    );
    const bodyField = getAiBudgetScopeBodyField(scope);

    const toDelete = existingBudgets.filter(
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
}

export function BudgetsEditor({
    scope,
    orgId,
    title,
    description,
    hideCardHeader = false
}: {
    scope: AiBudgetScope;
    orgId: string;
    title: string;
    description: string;
    hideCardHeader?: boolean;
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

    const { conflictingKeys, invalidAmountKeys } = useMemo(
        () => getBudgetRowsErrors(rows),
        [rows]
    );

    const hasErrors = conflictingKeys.size > 0 || invalidAmountKeys.size > 0;

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
            await saveBudgetRows({
                api,
                orgId,
                scope,
                existingBudgets: budgetsQuery.data ?? [],
                rows
            });

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

    const body = (
        <>
            <SettingsSectionBody>
                <BudgetRowsFields
                    rows={rows}
                    onChange={setRows}
                    disabled={saveLoading || budgetsQuery.isLoading}
                    attemptedSave={attemptedSave}
                />
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
        </>
    );

    if (hideCardHeader) {
        return <div className="space-y-4">{body}</div>;
    }

    return (
        <SettingsSection>
            <SettingsSectionHeader>
                <SettingsSectionTitle>{title}</SettingsSectionTitle>
                <SettingsSectionDescription>
                    {description}
                </SettingsSectionDescription>
            </SettingsSectionHeader>
            {body}
        </SettingsSection>
    );
}
