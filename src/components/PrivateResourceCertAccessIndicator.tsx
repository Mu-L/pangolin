"use client";

import { Button } from "@app/components/ui/button";
import {
    Popover,
    PopoverAnchor,
    PopoverContent
} from "@app/components/ui/popover";
import { useCertificate } from "@app/hooks/useCertificate";
import { cn } from "@app/lib/cn";
import {
    CheckCircle2,
    Clock,
    RotateCw,
    XCircle
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

type PrivateResourceCertAccessIndicatorProps = {
    orgId: string;
    domainId: string;
    fullDomain: string;
};

function getStatusColor(status: string) {
    switch (status) {
        case "valid":
            return "text-green-500";
        case "pending":
        case "requested":
            return "text-yellow-500";
        case "expired":
        case "failed":
            return "text-red-500";
        default:
            return "text-muted-foreground";
    }
}

function getStatusIcon(status: string) {
    switch (status) {
        case "valid":
            return CheckCircle2;
        case "pending":
        case "requested":
            return Clock;
        case "expired":
        case "failed":
            return XCircle;
        default:
            return Clock;
    }
}

function shouldShowRefreshButton(status: string, updatedAt: number) {
    return (
        status === "failed" ||
        status === "expired" ||
        (status === "requested" &&
            updatedAt &&
            new Date(updatedAt * 1000).getTime() < Date.now() - 5 * 60 * 1000)
    );
}

export function PrivateResourceCertAccessIndicator({
    orgId,
    domainId,
    fullDomain
}: PrivateResourceCertAccessIndicatorProps) {
    const t = useTranslations();
    const [open, setOpen] = useState(false);
    const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const { cert, certLoading, certError, refreshing, refreshCert } =
        useCertificate({
            orgId,
            domainId,
            fullDomain,
            autoFetch: true
        });

    const clearCloseTimer = useCallback(() => {
        if (closeTimerRef.current != null) {
            clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
        }
    }, []);

    const scheduleClose = useCallback(() => {
        clearCloseTimer();
        closeTimerRef.current = setTimeout(() => setOpen(false), 280);
    }, [clearCloseTimer]);

    const handleEnterOpen = useCallback(() => {
        clearCloseTimer();
        setOpen(true);
    }, [clearCloseTimer]);

    useEffect(() => {
        return () => clearCloseTimer();
    }, [clearCloseTimer]);

    const handleRefresh = async () => {
        await refreshCert();
    };

    if (certLoading) {
        return (
            <div
                className="h-4 w-4 shrink-0 rounded-[2px] bg-muted animate-pulse"
                aria-busy="true"
                aria-label={t("loading")}
            />
        );
    }

    const isPending = cert?.status === "pending";
    const disableWildcard = cert?.domainType === "wildcard";

    let TriggerIcon = Clock;
    let triggerIconClass = "text-muted-foreground";
    if (certError) {
        TriggerIcon = XCircle;
        triggerIconClass = "text-red-500";
    } else if (cert) {
        TriggerIcon = getStatusIcon(cert.status);
        triggerIconClass = getStatusColor(cert.status);
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverAnchor asChild>
                <button
                    type="button"
                    className={cn(
                        "inline-flex items-center justify-center shrink-0 rounded-[2px] outline-offset-2",
                        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
                        certError && "text-red-500"
                    )}
                    onMouseEnter={handleEnterOpen}
                    onMouseLeave={scheduleClose}
                    onClick={(e) => {
                        e.preventDefault();
                        setOpen((v) => !v);
                    }}
                    aria-expanded={open}
                    aria-haspopup="dialog"
                    aria-label={t("certificateStatus")}
                >
                    <TriggerIcon
                        className={cn("h-4 w-4", triggerIconClass)}
                        aria-hidden
                    />
                </button>
            </PopoverAnchor>
            <PopoverContent
                className="w-72 space-y-3 p-4"
                align="start"
                side="bottom"
                sideOffset={6}
                onMouseEnter={clearCloseTimer}
                onMouseLeave={scheduleClose}
                onOpenAutoFocus={(e) => e.preventDefault()}
            >
                <div className="space-y-2">
                    <div className="text-sm font-medium text-muted-foreground">
                        {t("certificateStatus")}
                    </div>
                    {certError ? (
                        <span className="inline-flex items-center gap-1.5 text-sm">
                            <XCircle className="h-4 w-4 shrink-0 text-red-500" />
                            {certError}
                        </span>
                    ) : !cert ? (
                        <span className="inline-flex items-center gap-1.5 text-sm">
                            <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                            {t("none", { defaultValue: "None" })}
                        </span>
                    ) : (
                        <>
                            {isPending && !disableWildcard ? (
                                <Button
                                    variant="ghost"
                                    className="h-auto p-0 text-sm font-normal"
                                    onClick={handleRefresh}
                                    disabled={refreshing}
                                    title={t("restartCertificate", {
                                        defaultValue: "Restart Certificate"
                                    })}
                                >
                                    <span className="inline-flex items-center gap-2">
                                        {(() => {
                                            const StatusIcon = getStatusIcon(
                                                cert.status
                                            );
                                            return (
                                                <StatusIcon
                                                    className={`h-4 w-4 shrink-0 ${getStatusColor(cert.status)}`}
                                                />
                                            );
                                        })()}
                                        {cert.status.charAt(0).toUpperCase() +
                                            cert.status.slice(1)}
                                        <RotateCw
                                            className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`}
                                        />
                                    </span>
                                </Button>
                            ) : (
                                <span className="text-sm">
                                    <span className="inline-flex items-center gap-2">
                                        {(() => {
                                            const StatusIcon = getStatusIcon(
                                                cert.status
                                            );
                                            return (
                                                <StatusIcon
                                                    className={`h-4 w-4 shrink-0 ${getStatusColor(cert.status)}`}
                                                />
                                            );
                                        })()}
                                        {cert.status.charAt(0).toUpperCase() +
                                            cert.status.slice(1)}
                                        {shouldShowRefreshButton(
                                            cert.status,
                                            cert.updatedAt
                                        ) && !disableWildcard ? (
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="p-0 w-3 h-auto align-middle"
                                                onClick={handleRefresh}
                                                disabled={refreshing}
                                                title={t("restartCertificate", {
                                                    defaultValue:
                                                        "Restart Certificate"
                                                })}
                                            >
                                                <RotateCw
                                                    className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`}
                                                />
                                            </Button>
                                        ) : null}
                                    </span>
                                </span>
                            )}
                            {cert.errorMessage &&
                            (cert.status === "failed" ||
                                cert.status === "expired") ? (
                                <p className="text-xs text-muted-foreground break-all">
                                    {cert.errorMessage}
                                </p>
                            ) : null}
                            {cert.expiresAt && cert.status === "valid" ? (
                                <p className="text-xs text-muted-foreground">
                                    {t("expiresAt")}:{" "}
                                    {new Date(
                                        cert.expiresAt
                                    ).toLocaleDateString()}
                                </p>
                            ) : null}
                        </>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
