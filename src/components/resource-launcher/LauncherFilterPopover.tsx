"use client";

import {
    formatMultiSitesSelectorLabel,
    MultiSitesSelector
} from "@app/components/multi-site-selector";
import {
    formatLabelsSelectorLabel,
    LabelsSelector,
    type SelectedLabel
} from "@app/components/labels-selector";
import { Button } from "@app/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@app/components/ui/popover";
import { cn } from "@app/lib/cn";
import { useTranslations } from "next-intl";
import { ChevronsUpDown, Funnel } from "lucide-react";
import { useState } from "react";
import type { Selectedsite } from "@app/components/site-selector";

type LauncherFilterPopoverProps = {
    orgId: string;
    selectedSites: Selectedsite[];
    selectedLabels: SelectedLabel[];
    onSitesChange: (sites: Selectedsite[]) => void;
    onLabelsChange: (labels: SelectedLabel[]) => void;
};

export function LauncherFilterPopover({
    orgId,
    selectedSites,
    selectedLabels,
    onSitesChange,
    onLabelsChange
}: LauncherFilterPopoverProps) {
    const t = useTranslations();
    const [sitesOpen, setSitesOpen] = useState(false);
    const [labelsOpen, setLabelsOpen] = useState(false);

    return (
        <Popover modal={false}>
            <PopoverTrigger asChild>
                <Button variant="outline" size="icon" className="shrink-0">
                    <Funnel className="size-4" />
                    <span className="sr-only">
                        {t("resourceLauncherFilter")}
                    </span>
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72">
                <div className="flex flex-col gap-4">
                    <div className="space-y-2">
                        <p className="text-sm font-semibold">{t("sites")}</p>
                        <Popover open={sitesOpen} onOpenChange={setSitesOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    className={cn(
                                        "w-full justify-between font-normal",
                                        selectedSites.length === 0 &&
                                            "text-muted-foreground"
                                    )}
                                >
                                    <span className="truncate text-left">
                                        {formatMultiSitesSelectorLabel(
                                            selectedSites,
                                            t
                                        )}
                                    </span>
                                    <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent
                                className="w-[var(--radix-popover-trigger-width)] p-0"
                                align="start"
                            >
                                <MultiSitesSelector
                                    orgId={orgId}
                                    selectedSites={selectedSites}
                                    onSelectionChange={onSitesChange}
                                />
                            </PopoverContent>
                        </Popover>
                    </div>
                    <div className="space-y-2">
                        <p className="text-sm font-semibold">{t("labels")}</p>
                        <Popover open={labelsOpen} onOpenChange={setLabelsOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    className={cn(
                                        "w-full justify-between font-normal",
                                        selectedLabels.length === 0 &&
                                            "text-muted-foreground"
                                    )}
                                >
                                    <span className="truncate text-left">
                                        {formatLabelsSelectorLabel(
                                            selectedLabels,
                                            t
                                        )}
                                    </span>
                                    <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent
                                className="w-[var(--radix-popover-trigger-width)] p-0"
                                align="start"
                            >
                                <LabelsSelector
                                    orgId={orgId}
                                    selectedLabels={selectedLabels}
                                    toggleLabel={(label, action) => {
                                        if (action === "attach") {
                                            onLabelsChange([
                                                ...selectedLabels,
                                                label
                                            ]);
                                        } else {
                                            onLabelsChange(
                                                selectedLabels.filter(
                                                    (item) =>
                                                        item.labelId !==
                                                        label.labelId
                                                )
                                            );
                                        }
                                    }}
                                />
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
