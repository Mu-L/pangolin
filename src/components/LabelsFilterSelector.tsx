"use client";

import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList
} from "@app/components/ui/command";
import { orgQueries } from "@app/lib/queries";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useDebounce } from "use-debounce";
import { Checkbox } from "./ui/checkbox";

export type LabelFilterOption = {
    labelId: number;
    name: string;
    color: string;
};

type LabelsFilterSelectorProps = {
    orgId: string;
    isSelected: (label: LabelFilterOption) => boolean;
    onToggle: (label: LabelFilterOption) => void;
    onClear?: () => void;
    showClear?: boolean;
};

export function LabelsFilterSelector({
    orgId,
    isSelected,
    onToggle,
    onClear,
    showClear = false
}: LabelsFilterSelectorProps) {
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

    return (
        <Command shouldFilter={false}>
            <CommandInput
                placeholder={t("labelSearch")}
                value={labelSearchQuery}
                onValueChange={setlabelsSearchQuery}
            />
            <CommandList>
                <CommandEmpty>{t("labelsNotFound")}</CommandEmpty>
                <CommandGroup>
                    {showClear && onClear && (
                        <CommandItem
                            onSelect={onClear}
                            className="text-muted-foreground"
                        >
                            {t("accessFilterClear")}
                        </CommandItem>
                    )}
                    {labels.map((label) => (
                        <CommandItem
                            key={label.labelId}
                            value={label.name}
                            onSelect={() => {
                                onToggle(label);
                            }}
                            className="flex items-center gap-2"
                        >
                            <Checkbox
                                className="pointer-events-none shrink-0"
                                checked={isSelected(label)}
                                aria-hidden
                                tabIndex={-1}
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
    );
}
