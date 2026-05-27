"use client";

import { dataTableFilterPopoverContentClassName } from "@app/lib/dataTableFilterPopover";
import type { Measurable } from "@radix-ui/rect";
import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { LabelBadge } from "./label-badge";
import { LabelOverflowBadge } from "./label-overflow-badge";
import { LabelsSelector, type SelectedLabel } from "./labels-selector";
import { Button } from "./ui/button";
import {
    Popover,
    PopoverAnchor,
    PopoverContent,
    PopoverTrigger
} from "./ui/popover";

const MAX_VISIBLE_LABELS = 4;
const MAX_VISIBLE_BEFORE_OVERFLOW = MAX_VISIBLE_LABELS - 1;

type TableLabelsCellProps = {
    orgId: string;
    localLabels: SelectedLabel[];
    toggleLabel: (label: SelectedLabel, action: "attach" | "detach") => void;
};

export function TableLabelsCell({
    orgId,
    localLabels,
    toggleLabel
}: TableLabelsCellProps) {
    const t = useTranslations();
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const frozenAnchorRef = useRef<Measurable>({
        getBoundingClientRect: () => new DOMRect()
    });

    const hasOverflow = localLabels.length > MAX_VISIBLE_LABELS;
    const visibleLabels = localLabels.slice(
        0,
        hasOverflow ? MAX_VISIBLE_BEFORE_OVERFLOW : MAX_VISIBLE_LABELS
    );
    const overflowLabels = hasOverflow
        ? localLabels.slice(MAX_VISIBLE_BEFORE_OVERFLOW)
        : [];

    function handleOpenChange(open: boolean) {
        if (open && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            frozenAnchorRef.current = {
                getBoundingClientRect: () => rect
            };
        }
        setIsPopoverOpen(open);
    }

    return (
        <div className="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-1">
            <Popover open={isPopoverOpen} onOpenChange={handleOpenChange}>
                <PopoverAnchor virtualRef={frozenAnchorRef} />
                <PopoverTrigger asChild>
                    <Button
                        ref={triggerRef}
                        size="icon"
                        variant="outline"
                        className="size-auto shrink-0 rounded-full p-1"
                        title={t("addLabels")}
                    >
                        <span className="sr-only">{t("addLabels")}</span>
                        <PlusIcon className="size-3" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent
                    align="start"
                    side="bottom"
                    className={`${dataTableFilterPopoverContentClassName} p-0`}
                    updatePositionStrategy="optimized"
                >
                    <LabelsSelector
                        orgId={orgId}
                        selectedLabels={localLabels}
                        toggleLabel={toggleLabel}
                        onClose={() => handleOpenChange(false)}
                    />
                </PopoverContent>
            </Popover>
            <div className="flex min-w-0 flex-nowrap items-center justify-start gap-1 overflow-hidden">
                {visibleLabels.map((label) => (
                    <LabelBadge
                        key={label.labelId}
                        className="shrink-0"
                        onClick={() => handleOpenChange(true)}
                        {...label}
                    />
                ))}
                {overflowLabels.length > 0 && (
                    <LabelOverflowBadge
                        labels={overflowLabels}
                        onClick={() => handleOpenChange(true)}
                    />
                )}
            </div>
        </div>
    );
}
