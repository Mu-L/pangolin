"use client";

import { LabelBadge } from "@app/components/label-badge";
import { cn } from "@app/lib/cn";
import type { LauncherResource } from "@server/routers/launcher/types";
import { LauncherLabelsRow } from "./LauncherLabelsRow";
import { LauncherResourceAccess } from "./LauncherResourceAccess";
import { LauncherResourceIcon } from "./LauncherResourceIcon";
import {
    getLauncherResourceClickProps,
    useLauncherResourceAction
} from "./useLauncherResourceAction";

type LauncherResourceRowProps = {
    resource: LauncherResource;
    showLabels: boolean;
    showSiteTags: boolean;
    isLast?: boolean;
};

export function LauncherResourceRow({
    resource,
    showLabels,
    showSiteTags,
    isLast = false
}: LauncherResourceRowProps) {
    const hasTags =
        (showSiteTags && resource.site) ||
        (showLabels && resource.labels.length > 0);
    const { handleAction, isClickable } = useLauncherResourceAction({
        accessUrl: resource.accessUrl,
        accessCopyValue: resource.accessCopyValue
    });
    const clickProps = getLauncherResourceClickProps(handleAction, isClickable);

    return (
        <div
            className={cn(
                "flex items-center gap-2.5 p-4 transition-colors",
                isLast ? undefined : "border-b border-border",
                isClickable && "hover:bg-accent/40",
                clickProps.className
            )}
            onClick={clickProps.onClick}
            onKeyDown={clickProps.onKeyDown}
            role={clickProps.role}
            tabIndex={clickProps.tabIndex}
        >
            <LauncherResourceIcon
                iconUrl={resource.iconUrl}
                name={resource.name}
                variant="list"
            />

            <span className="shrink-0 text-sm font-semibold text-foreground">
                {resource.name}
            </span>

            <LauncherResourceAccess
                accessDisplay={resource.accessDisplay}
                accessCopyValue={resource.accessCopyValue}
                accessUrl={resource.accessUrl}
                variant="list"
            />

            {hasTags ? (
                <div className="ml-auto flex min-w-0 max-w-md shrink items-center justify-end gap-1">
                    {showSiteTags && resource.site ? (
                        <LabelBadge
                            name={resource.site.name}
                            color="#a1a1aa"
                            displayOnly
                            className="shrink-0"
                        />
                    ) : null}
                    {showLabels ? (
                        <LauncherLabelsRow
                            labels={resource.labels}
                            variant="single-row"
                            className="w-auto shrink-0 justify-end"
                        />
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
