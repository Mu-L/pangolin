"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
    InfoSection,
    InfoSectionContent,
    InfoSections,
    InfoSectionTitle
} from "@app/components/InfoSection";
import { useTranslations } from "next-intl";
import { Badge } from "./ui/badge";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { AlertTriangle } from "lucide-react";

type DomainInfoCardProps = {
    failed: boolean;
    verified: boolean;
    type: string | null;
    errorMessage?: string | null;
};

export default function DomainInfoCard({
    failed,
    verified,
    type,
    errorMessage
}: DomainInfoCardProps) {
    const t = useTranslations();
    const env = useEnvContext();

    const getTypeDisplay = (type: string) => {
        switch (type) {
            case "ns":
                return t("selectDomainTypeNsName");
            case "cname":
                return t("selectDomainTypeCnameName");
            case "wildcard":
                return t("selectDomainTypeWildcardName");
            default:
                return type;
        }
    };

    return (
        <div className="space-y-3">
        <Alert>
            <AlertDescription>
                <InfoSections cols={3}>
                    <InfoSection>
                        <InfoSectionTitle>{t("type")}</InfoSectionTitle>
                        <InfoSectionContent>
                            <span>{getTypeDisplay(type ? type : "")}</span>
                        </InfoSectionContent>
                    </InfoSection>
                    {env.env.flags.usePangolinDns && (
                        <InfoSection>
                            <InfoSectionTitle>{t("status")}</InfoSectionTitle>
                            <InfoSectionContent>
                                {failed ? (
                                    <Badge variant="red">
                                        {t("failed", { fallback: "Failed" })}
                                    </Badge>
                                ) : verified ? (
                                    type === "wildcard" ? (
                                        <Badge variant="outlinePrimary">
                                            {t("manual", {
                                                fallback: "Manual"
                                            })}
                                        </Badge>
                                    ) : (
                                        <Badge variant="green">
                                            {t("verified")}
                                        </Badge>
                                    )
                                ) : (
                                    <Badge variant="yellow">
                                        {t("pending", { fallback: "Pending" })}
                                    </Badge>
                                )}
                            </InfoSectionContent>
                        </InfoSection>
                    )}
                </InfoSections>
            </AlertDescription>
        </Alert>
        {errorMessage && (failed || !verified) && (
            <Alert variant={failed ? "destructive" : "warning"}>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>
                    {failed
                        ? t("domainErrorTitle", { fallback: "Domain Error" })
                        : t("domainPendingErrorTitle", { fallback: "Verification Issue" })}
                </AlertTitle>
                <AlertDescription className="font-mono text-xs break-all">
                    {errorMessage}
                </AlertDescription>
            </Alert>
        )}
        </div>
    );
}
