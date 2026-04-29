"use client";

import CertificateStatus from "@app/components/CertificateStatus";
import {
    Popover,
    PopoverAnchor,
    PopoverContent
} from "@app/components/ui/popover";
import { useCertificate } from "@app/hooks/useCertificate";
import { cn } from "@app/lib/cn";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
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

export function PrivateResourceCertAccessIndicator({
    orgId,
    domainId,
    fullDomain
}: PrivateResourceCertAccessIndicatorProps) {
    const t = useTranslations();
    const [open, setOpen] = useState(false);
    const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const { cert, certLoading, certError } = useCertificate({
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

    if (certLoading) {
        return (
            <div
                className="h-4 w-4 shrink-0 rounded-[2px] bg-muted animate-pulse"
                aria-busy="true"
                aria-label={t("loading")}
            />
        );
    }

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
                className="w-72 p-4"
                align="start"
                side="bottom"
                sideOffset={6}
                onMouseEnter={clearCloseTimer}
                onMouseLeave={scheduleClose}
                onOpenAutoFocus={(e) => e.preventDefault()}
            >
                <CertificateStatus
                    orgId={orgId}
                    domainId={domainId}
                    fullDomain={fullDomain}
                    autoFetch
                    showLabel
                />
            </PopoverContent>
        </Popover>
    );
}
