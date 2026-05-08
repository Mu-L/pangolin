import { orgQueries } from "@app/lib/queries";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList
} from "./ui/command";
import { Checkbox } from "./ui/checkbox";
import { useTranslations } from "next-intl";
import { useDebounce } from "use-debounce";
import { type Selectedsite, SiteOnlineStatus } from "./site-selector";

type SelectedLabel = {
    name: string;
    color: string;
    labelId: number;
};

export type LabelsSelectorProps = {
    orgId: string;
    selectedLabels: SelectedLabel[];
    onSelectionChange: (sites: SelectedLabel[]) => void;
};

export function LabelsSelector({
    orgId,
    selectedLabels,
    onSelectionChange
}: LabelsSelectorProps) {
    const t = useTranslations();
    const [labelSearchQuery, setlabelsSearchQuery] = useState("");
    const [debouncedQuery] = useDebounce(labelSearchQuery, 150);

    const { data: labels = [] } = useQuery(
        orgQueries.labels({
            orgId,
            query: debouncedQuery,
            perPage: 10
        })
    );

    const labelsShown = useMemo(() => {
        const base = [...labels];
        if (debouncedQuery.trim().length === 0 && selectedLabels.length > 0) {
            const selectedNotInBase = selectedLabels.filter(
                (sel) => !base.some((s) => s.labelId === sel.labelId)
            );
            return [...selectedNotInBase, ...base];
        }
        return base;
    }, [debouncedQuery, labels, selectedLabels]);

    const selectedIds = useMemo(
        () => new Set(selectedLabels.map((s) => s.labelId)),
        [selectedLabels]
    );

    return (
        <Command shouldFilter={false}>
            <CommandInput
                placeholder={t("labelSearch")}
                value={labelSearchQuery}
                onValueChange={setlabelsSearchQuery}
            />
            <CommandList>
                <CommandEmpty className="px-3 break-all max-w-full wrap-anywhere text-wrap">
                    {labelSearchQuery.trim().length > 0 ? (
                        <>
                            {t("createNewLabel", {
                                label: labelSearchQuery.trim()
                            })}
                        </>
                    ) : (
                        t("labelsNotFound")
                    )}
                </CommandEmpty>
                <CommandGroup>
                    {labelsShown.map((label) => (
                        <CommandItem
                            key={label.labelId}
                            value={`${label.labelId}`}
                            onSelect={() => {
                                if (selectedIds.has(label.labelId)) {
                                    onSelectionChange(
                                        selectedLabels.filter(
                                            (l) => l.labelId !== label.labelId
                                        )
                                    );
                                } else {
                                    onSelectionChange([
                                        ...selectedLabels,
                                        label
                                    ]);
                                }
                            }}
                        >
                            <Checkbox
                                className="pointer-events-none shrink-0"
                                checked={selectedIds.has(label.labelId)}
                                onCheckedChange={() => {}}
                                aria-hidden
                                tabIndex={-1}
                            />
                            <div className="min-w-0 flex-1 flex items-center gap-2">
                                <span
                                    className="inline-block p-1 rounded-full bg-(--label-color)"
                                    style={{
                                        // @ts-expect-error CSS variable
                                        "--label-color": label.color
                                    }}
                                />
                                <span className="min-w-0 flex-1 truncate">
                                    {label.name}
                                </span>
                            </div>
                        </CommandItem>
                    ))}
                </CommandGroup>
            </CommandList>
        </Command>
    );
}
