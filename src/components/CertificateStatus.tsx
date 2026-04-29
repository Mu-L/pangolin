"use client";

import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, Loader2, RotateCw, XCircle } from "lucide-react";
import { useCertificate } from "@app/hooks/useCertificate";
import { useTranslations } from "next-intl";

type CertificateStatusProps = {
    orgId: string;
    domainId: string;
    fullDomain: string;
    autoFetch?: boolean;
    showLabel?: boolean;
    className?: string;
    onRefresh?: () => void;
    polling?: boolean;
    pollingInterval?: number;
};

export default function CertificateStatus({
    orgId,
    domainId,
    fullDomain,
    autoFetch = true,
    showLabel = true,
    className = "",
    onRefresh,
    polling = false,
    pollingInterval = 5000
}: CertificateStatusProps) {
    const t = useTranslations();
    const { cert, certLoading, certError, refreshing, refreshCert } =
        useCertificate({
            orgId,
            domainId,
            fullDomain,
            autoFetch,
            polling,
            pollingInterval
        });

    const handleRefresh = async () => {
        await refreshCert();
        onRefresh?.();
    };

    const getStatusColor = (status: string) => {
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
    };

    const getStatusIcon = (status: string) => {
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
    };

    const shouldShowRefreshButton = (status: string, updatedAt: number) => {
        return (
            status === "failed" ||
            status === "expired" ||
            (status === "requested" &&
                updatedAt &&
                new Date(updatedAt * 1000).getTime() <
                    Date.now() - 5 * 60 * 1000)
        );
    };

    if (certLoading) {
        return (
            <div className={`flex items-center gap-2 ${className}`}>
                {showLabel && (
                    <span className="text-sm font-medium">
                        {t("certificateStatus")}:
                    </span>
                )}
                <span className="inline-flex items-center gap-1.5 text-sm">
                    <Loader2
                        className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground"
                        aria-hidden
                    />
                    {t("loading")}
                </span>
            </div>
        );
    }

    if (certError) {
        return (
            <div className={`flex items-center gap-2 ${className}`}>
                {showLabel && (
                    <span className="text-sm font-medium">
                        {t("certificateStatus")}:
                    </span>
                )}
                <span className="inline-flex items-center gap-1.5 text-sm">
                    <XCircle className="h-4 w-4 shrink-0 text-red-500" />
                    {certError}
                </span>
            </div>
        );
    }

    if (!cert) {
        return (
            <div className={`flex items-center gap-2 ${className}`}>
                {showLabel && (
                    <span className="text-sm font-medium">
                        {t("certificateStatus")}:
                    </span>
                )}
                <span className="inline-flex items-center gap-1.5 text-sm">
                    <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                    {t("none", { defaultValue: "None" })}
                </span>
            </div>
        );
    }

    const isPending = cert.status === "pending";
    const disableRestartButton = cert.domainType === "wildcard";
    const StatusIcon = getStatusIcon(cert.status);

    return (
        <div className={`flex items-center gap-2 ${className}`}>
            {showLabel && (
                <span className="text-sm font-medium">
                    {t("certificateStatus")}:
                </span>
            )}
            {isPending && !disableRestartButton ? (
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
                        <StatusIcon
                            className={`h-4 w-4 shrink-0 ${getStatusColor(cert.status)}`}
                        />
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
                        <StatusIcon
                            className={`h-4 w-4 shrink-0 ${getStatusColor(cert.status)}`}
                        />
                        {cert.status.charAt(0).toUpperCase() +
                            cert.status.slice(1)}
                        {shouldShowRefreshButton(cert.status, cert.updatedAt) &&
                        !disableRestartButton ? (
                            <Button
                                size="icon"
                                variant="ghost"
                                className="p-0 w-3 h-auto align-middle"
                                onClick={handleRefresh}
                                disabled={refreshing}
                                title={t("restartCertificate", {
                                    defaultValue: "Restart Certificate"
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
        </div>
    );
}
