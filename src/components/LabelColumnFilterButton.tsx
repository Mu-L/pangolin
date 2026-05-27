"use client";

import { Button } from "@app/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList
} from "@app/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@app/components/ui/popover";
import { cn } from "@app/lib/cn";
import { dataTableFilterPopoverContentClassName } from "@app/lib/dataTableFilterPopover";
import { CheckIcon, Funnel } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { orgQueries } from "@app/lib/queries";
import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "use-debounce";
import { LabelBadge } from "./label-badge";
import { LabelOverflowBadge } from "./label-overflow-badge";
import { LABEL_COLORS } from "./labels-selector";

const MAX_VISIBLE_SUMMARY_LABELS = 3;

type LabelColumnFilterButtonProps = {
    selectedValues: string[];
    onSelectedValuesChange: (values: string[]) => void;
    className?: string;
    label: string;
    orgId: string;
};

export function LabelColumnFilterButton({
    selectedValues,
    onSelectedValuesChange,
    className,
    label,
    orgId
}: LabelColumnFilterButtonProps) {
    const [open, setOpen] = useState(false);
    const t = useTranslations();

    const [labelSearchQuery, setlabelsSearchQuery] = useState("");
    const [debouncedQuery] = useDebounce(labelSearchQuery, 150);

    const { data: labels = [] } = useQuery(
        orgQueries.labels({
            orgId,
            query: debouncedQuery,
            perPage: 500
        })
    );

    const selectedSet = useMemo(
        () => new Set(selectedValues),
        [selectedValues]
    );

    const selectedLabels = useMemo(
        () =>
            selectedValues.map((name) => {
                const foundLabel = labels.find((label) => label.name === name);
                return {
                    name,
                    color: foundLabel?.color ?? LABEL_COLORS.gray
                };
            }),
        [selectedValues, labels]
    );

    const summary = useMemo(() => {
        if (selectedLabels.length === 0) {
            return null;
        }

        const visibleLabels = selectedLabels.slice(0, MAX_VISIBLE_SUMMARY_LABELS);
        const overflowLabels = selectedLabels.slice(MAX_VISIBLE_SUMMARY_LABELS);

        return (
            <div className="flex min-w-0 flex-nowrap items-center gap-1">
                {visibleLabels.map((label) => (
                    <LabelBadge
                        key={label.name}
                        displayOnly
                        name={label.name}
                        color={label.color}
                        className="shrink-0"
                    />
                ))}
                {overflowLabels.length > 0 && (
                    <LabelOverflowBadge
                        labels={overflowLabels}
                        displayOnly
                        className="shrink-0"
                    />
                )}
            </div>
        );
    }, [selectedLabels]);

    function toggle(value: string) {
        const next = selectedSet.has(value)
            ? selectedValues.filter((v) => v !== value)
            : [...selectedValues, value];
        onSelectedValuesChange(next);
    }

    return (
        <div className="flex items-center">
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="ghost"
                        role="combobox"
                        aria-expanded={open}
                        className={cn(
                            "justify-between text-sm h-8 px-2",
                            selectedValues.length === 0 &&
                                "text-muted-foreground",
                            className
                        )}
                    >
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="shrink-0">{label}</span>
                            <Funnel className="size-4 flex-none shrink-0" />
                            {summary}
                        </div>
                    </Button>
                </PopoverTrigger>
                <PopoverContent
                    className={dataTableFilterPopoverContentClassName}
                    align="start"
                >
                    <Command shouldFilter={false}>
                        <CommandInput
                            placeholder={t("labelSearch")}
                            value={labelSearchQuery}
                            onValueChange={setlabelsSearchQuery}
                        />
                        <CommandList>
                            <CommandEmpty>{t("labelsNotFound")}</CommandEmpty>
                            <CommandGroup>
                                {selectedValues.length > 0 && (
                                    <CommandItem
                                        onSelect={() => {
                                            onSelectedValuesChange([]);
                                            setOpen(false);
                                        }}
                                        className="text-muted-foreground"
                                    >
                                        {t("accessLabelFilterClear")}
                                    </CommandItem>
                                )}
                                {labels.map((label) => (
                                    <CommandItem
                                        key={label.name}
                                        value={label.name}
                                        onSelect={() => {
                                            toggle(label.name);
                                        }}
                                        className="flex items-center gap-2"
                                    >
                                        <CheckIcon
                                            className={cn(
                                                "mr-2 h-4 w-4",
                                                selectedSet.has(label.name)
                                                    ? "opacity-100"
                                                    : "opacity-0"
                                            )}
                                        />
                                        <div
                                            className="size-2 rounded-full bg-(--color) flex-none"
                                            style={{
                                                // @ts-expect-error css color
                                                "--color": label.color
                                            }}
                                        />
                                        {label.name}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
        </div>
    );
}
