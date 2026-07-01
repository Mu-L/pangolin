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
                "flex items-center gap-2.5 p-4 max-md:min-w-max max-md:whitespace-nowrap",
                isLast ? undefined : "border-b border-border",
                clickProps.className
            )}
            onClick={clickProps.onClick}
            onKeyDown={clickProps.onKeyDown}
            role={clickProps.role}
            tabIndex={clickProps.tabIndex}
        >
            <div
                className={cn(
                    "flex shrink-0 items-center gap-2.5",
                    "max-md:sticky max-md:left-0 max-md:z-10 max-md:min-w-[9rem]",
                    "max-md:-my-4 max-md:-ml-4 max-md:py-4 max-md:pl-4 max-md:pr-3",
                    "max-md:bg-card max-md:[mask-image:linear-gradient(to_left,transparent_0%,black_20px)]"
                )}
            >
                <LauncherResourceIcon
                    iconUrl={resource.iconUrl}
                    name={resource.name}
                    variant="list"
                />

                <span className="text-sm font-semibold text-foreground">
                    {resource.name}
                </span>
            </div>

            <LauncherResourceAccess
                accessDisplay={resource.accessDisplay}
                accessCopyValue={resource.accessCopyValue}
                accessUrl={resource.accessUrl}
                variant="list"
            />

            {hasTags ? (
                <div className="flex min-w-0 max-w-md shrink items-center justify-end gap-1 max-md:shrink-0 max-md:max-w-none md:ml-auto">
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
