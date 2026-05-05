"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
    ShieldCheck,
    ShieldOff,
    Eye,
    EyeOff,
    CheckCircle2,
    XCircle,
    Clock
} from "lucide-react";
import { useResourceContext } from "@app/hooks/useResourceContext";
import CopyToClipboard from "@app/components/CopyToClipboard";
import {
    InfoSection,
    InfoSectionContent,
    InfoSections,
    InfoSectionTitle
} from "@app/components/InfoSection";
import { useTranslations } from "next-intl";
import CertificateStatus from "@app/components/CertificateStatus";
import { toUnicode } from "punycode";
import { build } from "@server/build";

type ResourceInfoBoxType = {};

export default function ResourceInfoBox({}: ResourceInfoBoxType) {
    const { resource, authInfo } = useResourceContext();

    const t = useTranslations();

    const fullUrl = `${resource.ssl ? "https" : "http"}://${toUnicode(resource.fullDomain || "")}`;

    return (
        <Alert>
            <AlertDescription>
                {/* 4 cols because of the certs */}
                <InfoSections cols={resource.http && build != "oss" ? 6 : 5}>
                    <InfoSection>
                        <InfoSectionTitle>{t("identifier")}</InfoSectionTitle>
                        <InfoSectionContent>
                            <span className="inline-flex items-center">
                                {resource.niceId}
                            </span>
                        </InfoSectionContent>
                    </InfoSection>
                    {resource.http ? (
                        <>
                            <InfoSection>
                                <InfoSectionTitle>URL</InfoSectionTitle>
                                <InfoSectionContent>
                                    {resource.wildcard ? (
                                        <span className="inline-flex items-center">
                                            {fullUrl}
                                        </span>
                                    ) : (
                                        <CopyToClipboard
                                            text={fullUrl}
                                            isLink={true}
                                        />
                                    )}
                                </InfoSectionContent>
                            </InfoSection>
                            <InfoSection>
                                <InfoSectionTitle>
                                    {t("authentication")}
                                </InfoSectionTitle>
                                <InfoSectionContent>
                                    {authInfo.password ||
                                    authInfo.pincode ||
                                    authInfo.sso ||
                                    authInfo.whitelist ||
                                    authInfo.headerAuth ? (
                                        <div className="flex items-center space-x-2">
                                            <ShieldCheck className="w-4 h-4 flex-shrink-0 text-green-500" />
                                            <span>{t("protected")}</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center space-x-2">
                                            <ShieldOff className="w-4 h-4 flex-shrink-0 text-yellow-500" />
                                            <span>{t("notProtected")}</span>
                                        </div>
                                    )}
                                </InfoSectionContent>
                            </InfoSection>
                            {/* {isEnabled && (
                                <InfoSection>
                                    <InfoSectionTitle>Socket</InfoSectionTitle>
                                    <InfoSectionContent>
                                        {isAvailable ? (
                                            <span className="text-green-500 flex items-center space-x-2">
                                                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                                <span>Online</span>
                                            </span>
                                        ) : (
                                            <span className="text-neutral-500 flex items-center space-x-2">
                                                <div className="w-2 h-2 bg-neutral-500 rounded-full"></div>
                                                <span>Offline</span>
                                            </span>
                                        )}
                                    </InfoSectionContent>
                                </InfoSection>
                            )} */}
                        </>
                    ) : (
                        <>
                            <InfoSection>
                                <InfoSectionTitle>
                                    {t("protocol")}
                                </InfoSectionTitle>
                                <InfoSectionContent>
                                    <span className="inline-flex items-center">
                                        {resource.protocol.toUpperCase()}
                                    </span>
                                </InfoSectionContent>
                            </InfoSection>
                            <InfoSection>
                                <InfoSectionTitle>{t("port")}</InfoSectionTitle>
                                <InfoSectionContent>
                                    <CopyToClipboard
                                        text={resource.proxyPort!.toString()}
                                        isLink={false}
                                    />
                                </InfoSectionContent>
                            </InfoSection>
                            {/* {build == "oss" && (
                                <InfoSection>
                                    <InfoSectionTitle>
                                        {t("externalProxyEnabled")}
                                    </InfoSectionTitle>
                                    <InfoSectionContent>
                                        <span>
                                            {resource.enableProxy
                                                ? t("enabled")
                                                : t("disabled")}
                                        </span>
                                    </InfoSectionContent>
                                </InfoSection>
                            )} */}
                        </>
                    )}
                    {/* <InfoSection> */}
                    {/*     <InfoSectionTitle>{t('visibility')}</InfoSectionTitle> */}
                    {/*     <InfoSectionContent> */}
                    {/*         <span> */}
                    {/*             {resource.enabled ? t('enabled') : t('disabled')} */}
                    {/*         </span> */}
                    {/*     </InfoSectionContent> */}
                    {/* </InfoSection> */}
                    {/* Certificate Status Column */}
                    {resource.http &&
                        resource.domainId &&
                        resource.fullDomain &&
                        build != "oss" && (
                            <InfoSection>
                                <InfoSectionTitle>
                                    {t("certificateStatus", {
                                        defaultValue: "Certificate"
                                    })}
                                </InfoSectionTitle>
                                <InfoSectionContent>
                                    <CertificateStatus
                                        orgId={resource.orgId}
                                        domainId={resource.domainId}
                                        fullDomain={resource.fullDomain}
                                        autoFetch={true}
                                        showLabel={false}
                                        polling={true}
                                    />
                                </InfoSectionContent>
                            </InfoSection>
                        )}
                    <InfoSection>
                        <InfoSectionTitle>{t("health")}</InfoSectionTitle>
                        <InfoSectionContent>
                            {resource.health === "healthy" && (
                                <div className="flex items-center space-x-2">
                                    <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-green-500" />
                                    <span>{t("resourcesTableHealthy")}</span>
                                </div>
                            )}
                            {resource.health === "degraded" && (
                                <div className="flex items-center space-x-2">
                                    <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-yellow-500" />
                                    <span>{t("resourcesTableDegraded")}</span>
                                </div>
                            )}
                            {resource.health === "unhealthy" && (
                                <div className="flex items-center space-x-2">
                                    <XCircle className="w-4 h-4 flex-shrink-0 text-destructive" />
                                    <span>{t("resourcesTableUnhealthy")}</span>
                                </div>
                            )}
                            {(!resource.health ||
                                resource.health === "unknown") && (
                                <div className="flex items-center space-x-2">
                                    <Clock className="w-4 h-4 flex-shrink-0" />
                                    <span>{t("resourcesTableUnknown")}</span>
                                </div>
                            )}
                        </InfoSectionContent>
                    </InfoSection>
                    <InfoSection>
                        <InfoSectionTitle>{t("visibility")}</InfoSectionTitle>
                        <InfoSectionContent>
                            {resource.enabled ? (
                                <div className="flex items-center space-x-2">
                                    <Eye className="w-4 h-4 flex-shrink-0 text-green-500" />
                                    <span>{t("enabled")}</span>
                                </div>
                            ) : (
                                <div className="flex items-center space-x-2">
                                    <EyeOff className="w-4 h-4 flex-shrink-0 text-neutral-500" />
                                    <span>{t("disabled")}</span>
                                </div>
                            )}
                        </InfoSectionContent>
                    </InfoSection>
                </InfoSections>
            </AlertDescription>
        </Alert>
    );
}
