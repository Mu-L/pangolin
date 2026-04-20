"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useSiteContext } from "@app/hooks/useSiteContext";
import {
    InfoSection,
    InfoSectionContent,
    InfoSections,
    InfoSectionTitle
} from "@app/components/InfoSection";
import { useTranslations } from "next-intl";
import { useEnvContext } from "@app/hooks/useEnvContext";

type SiteInfoCardProps = {};

export default function SiteInfoCard({}: SiteInfoCardProps) {
    const { site, updateSite } = useSiteContext();
    const t = useTranslations();
    const { env } = useEnvContext();

    const getConnectionTypeString = (type: string) => {
        if (type === "newt") {
            return "Newt";
        } else if (type === "wireguard") {
            return "WireGuard";
        } else if (type === "local") {
            return t("local");
        } else {
            return t("unknown");
        }
    };

    return (
        <Alert>
            <AlertDescription>
                <InfoSections cols={site.endpoint ? 4 : 3}>
                    <InfoSection>
                        <InfoSectionTitle>{t("identifier")}</InfoSectionTitle>
                        <InfoSectionContent>{site.niceId}</InfoSectionContent>
                    </InfoSection>
                    {(site.type == "newt" || site.type == "wireguard") && (
                        <>
                            <InfoSection>
                                <InfoSectionTitle>
                                    {t("status")}
                                </InfoSectionTitle>
                                <InfoSectionContent>
                                    {site.online ? (
                                        <div className="text-green-500 flex items-center space-x-2">
                                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                            <span>{t("online")}</span>
                                        </div>
                                    ) : (
                                        <div className="text-neutral-500 flex items-center space-x-2">
                                            <div className="w-2 h-2 bg-neutral-500 rounded-full"></div>
                                            <span>{t("offline")}</span>
                                        </div>
                                    )}
                                </InfoSectionContent>
                            </InfoSection>
                        </>
                    )}
                    <InfoSection>
                        <InfoSectionTitle>
                            {t("connectionType")}
                        </InfoSectionTitle>
                        <InfoSectionContent>
                            {getConnectionTypeString(site.type)}
                        </InfoSectionContent>
                    </InfoSection>
                    {site.endpoint && (
                        <InfoSection>
                            <InfoSectionTitle>
                                {t("publicIpEndpoint")}
                            </InfoSectionTitle>
                            <InfoSectionContent>
                                {site.endpoint.includes(":")
                                    ? site.endpoint.substring(0, site.endpoint.lastIndexOf(":"))
                                    : site.endpoint}
                            </InfoSectionContent>
                        </InfoSection>
                    )}
                </InfoSections>
            </AlertDescription>
        </Alert>
    );
}
