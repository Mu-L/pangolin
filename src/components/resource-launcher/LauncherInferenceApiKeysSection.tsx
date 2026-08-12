"use client";

import CopyToClipboard from "@app/components/CopyToClipboard";
import {
    SettingsSection,
    SettingsSectionBody,
    SettingsSectionDescription,
    SettingsSectionHeader,
    SettingsSectionTitle,
    SettingsSubsectionDescription,
    SettingsSubsectionHeader,
    SettingsSubsectionTitle
} from "@app/components/Settings";
import { Button } from "@app/components/ui/button";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { toast } from "@app/hooks/useToast";
import { launcherQueries } from "@app/lib/queries";
import type {
    GetMyVirtualApiKeyResponse,
    VirtualApiKeyWithResources
} from "@server/routers/virtualApiKey/types";
import {
    formatVirtualApiKeyCredential,
    formatVirtualApiKeyPreview
} from "@app/lib/virtualApiKeyFormat";
import { useQuery } from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

type LauncherInferenceApiKeysSectionProps = {
    orgId: string;
    resourceGuid: string;
};

function useRevealSecret(orgId: string, virtualApiKeyId: string) {
    const t = useTranslations();
    const api = createApiClient(useEnvContext());
    const [credential, setCredential] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const revealSecret = () => {
        if (credential || loading) {
            return;
        }

        setLoading(true);
        api.get<AxiosResponse<GetMyVirtualApiKeyResponse>>(
            `/org/${orgId}/my-virtual-api-keys/${virtualApiKeyId}`
        )
            .then((res) => {
                const secret = res.data.data.virtualApiKey.secret;
                if (secret) {
                    setCredential(
                        formatVirtualApiKeyCredential(virtualApiKeyId, secret)
                    );
                } else {
                    toast({
                        variant: "destructive",
                        title: t("virtualApiKeysErrorFetchSecret"),
                        description: t(
                            "virtualApiKeysErrorFetchSecretDescription"
                        )
                    });
                }
            })
            .catch((e) => {
                toast({
                    variant: "destructive",
                    title: t("virtualApiKeysErrorFetchSecret"),
                    description: formatAxiosError(
                        e,
                        t("virtualApiKeysErrorFetchSecretDescription")
                    )
                });
            })
            .finally(() => {
                setLoading(false);
            });
    };

    return { credential, loading, revealSecret };
}

function PanelKeySecret({
    orgId,
    virtualApiKeyId,
    lastChars
}: {
    orgId: string;
    virtualApiKeyId: string;
    lastChars: string;
}) {
    const t = useTranslations();
    const preview = formatVirtualApiKeyPreview(virtualApiKeyId, lastChars);
    const { credential, loading, revealSecret } = useRevealSecret(
        orgId,
        virtualApiKeyId
    );
    const displayValue = credential ?? preview;

    return (
        <div className="flex items-center gap-3 min-w-0">
            <div className="min-w-0 flex-1">
                <CopyToClipboard
                    text={displayValue}
                    displayText={displayValue}
                />
            </div>
            {!credential ? (
                <Button
                    variant="link"
                    size="sm"
                    className="shrink-0 px-0 h-auto"
                    loading={loading}
                    onClick={revealSecret}
                >
                    {t("myVirtualApiKeysRevealSecret")}
                </Button>
            ) : null}
        </div>
    );
}

function ManualKeyRow({
    orgId,
    keyRow
}: {
    orgId: string;
    keyRow: VirtualApiKeyWithResources;
}) {
    const t = useTranslations();

    return (
        <div className="space-y-1 min-w-0">
            <p className="font-medium truncate">
                {keyRow.name || t("myVirtualApiKeysUnnamed")}
            </p>
            {keyRow.description ? (
                <p className="text-sm text-muted-foreground">
                    {keyRow.description}
                </p>
            ) : null}
            <PanelKeySecret
                orgId={orgId}
                virtualApiKeyId={keyRow.virtualApiKeyId}
                lastChars={keyRow.lastChars}
            />
        </div>
    );
}

export function LauncherInferenceApiKeysSection({
    orgId,
    resourceGuid
}: LauncherInferenceApiKeysSectionProps) {
    const t = useTranslations();
    const { data, isPending, isError } = useQuery(
        launcherQueries.myVirtualApiKeys(orgId, resourceGuid)
    );

    return (
        <SettingsSection>
            <SettingsSectionHeader>
                <SettingsSectionTitle>
                    {t("resourceLauncherApiKeys")}
                </SettingsSectionTitle>
                <SettingsSectionDescription>
                    {t("resourceLauncherApiKeysDescription")}
                </SettingsSectionDescription>
            </SettingsSectionHeader>
            <SettingsSectionBody>
                {isPending ? (
                    <div className="flex items-center justify-center py-6 text-muted-foreground">
                        <Loader2 className="size-5 animate-spin" />
                    </div>
                ) : null}
                {isError ? (
                    <p className="text-sm text-muted-foreground">
                        {t("resourceLauncherApiKeysError")}
                    </p>
                ) : null}
                {!isPending && !isError && data ? (
                    <div className="space-y-4">
                        <div className="space-y-1 min-w-0">
                            <p className="font-medium">
                                {t("resourceLauncherApiKeysIdentity")}
                            </p>
                            <PanelKeySecret
                                orgId={orgId}
                                virtualApiKeyId={data.userKey.virtualApiKeyId}
                                lastChars={data.userKey.lastChars}
                            />
                        </div>
                        {data.manualKeys.length > 0 ? (
                            <div>
                                <SettingsSubsectionHeader>
                                    <SettingsSubsectionTitle>
                                        {t("resourceLauncherApiKeysManual")}
                                    </SettingsSubsectionTitle>
                                    <SettingsSubsectionDescription>
                                        {t(
                                            "myVirtualApiKeysManualResourceDescription"
                                        )}
                                    </SettingsSubsectionDescription>
                                </SettingsSubsectionHeader>
                                <div className="space-y-3">
                                    {data.manualKeys.map((keyRow) => (
                                        <ManualKeyRow
                                            key={keyRow.virtualApiKeyId}
                                            orgId={orgId}
                                            keyRow={keyRow}
                                        />
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </SettingsSectionBody>
        </SettingsSection>
    );
}
