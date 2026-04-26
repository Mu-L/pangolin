"use client";

import { Button } from "@/components/ui/button";
import { Loader2, RotateCw } from "lucide-react";
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
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Loader2
                        className="h-3.5 w-3.5 shrink-0 animate-spin"
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
                <span className="text-sm text-red-500">{certError}</span>
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
                <span className="text-sm text-muted-foreground">
                    {t("none", { defaultValue: "None" })}
                </span>
            </div>
        );
    }

    const isPending = cert.status === "pending";

    return (
        <div className={`flex items-center gap-2 ${className}`}>
            {showLabel && (
                <span className="text-sm font-medium">
                    {t("certificateStatus")}:
                </span>
            )}
            {isPending ? (
                <Button
                    variant="ghost"
                    className={`h-auto p-0 text-sm ${getStatusColor(cert.status)}`}
                    onClick={handleRefresh}
                    disabled={refreshing}
                    title={t("restartCertificate", {
                        defaultValue: "Restart Certificate"
                    })}
                >
                    <span className="inline-flex items-center gap-1">
                        {cert.status.charAt(0).toUpperCase() + cert.status.slice(1)}
                        <RotateCw
                            className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`}
                        />
                    </span>
                </Button>
            ) : (
                <span className={`text-sm ${getStatusColor(cert.status)}`}>
                    <span className="inline-flex items-center gap-1">
                        {cert.status.charAt(0).toUpperCase() + cert.status.slice(1)}
                        {shouldShowRefreshButton(cert.status, cert.updatedAt) && (
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
                        )}
                    </span>
                </span>
            )}
        </div>
    );
}
