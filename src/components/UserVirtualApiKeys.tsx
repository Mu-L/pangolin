"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AxiosResponse } from "axios";
import moment from "moment";
import { Badge } from "@app/components/ui/badge";
import { Button } from "@app/components/ui/button";
import CopyTextBox from "@app/components/CopyTextBox";
import CopyToClipboard from "@app/components/CopyToClipboard";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import {
    SettingsContainer,
    SettingsFormCell,
    SettingsFormGrid,
    SettingsSection,
    SettingsSectionBody,
    SettingsSectionDescription,
    SettingsSectionHeader,
    SettingsSectionTitle as SectionTitle
} from "@app/components/Settings";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { toast } from "@app/hooks/useToast";
import type {
    GetMyVirtualApiKeyResponse,
    ListMyVirtualApiKeysResponse,
    VirtualApiKeyWithResources
} from "@server/routers/virtualApiKey/types";

type UserVirtualApiKeysProps = {
    orgId: string;
    resourceGuid?: string;
    initialData: ListMyVirtualApiKeysResponse;
};

function keyPreview(virtualApiKeyId: string, lastChars: string): string {
    return `vk-${virtualApiKeyId}••••${lastChars}`;
}

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
                    setCredential(`vk-${virtualApiKeyId}.${secret}`);
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

function OwnedKeySecret({
    orgId,
    virtualApiKeyId,
    lastChars
}: {
    orgId: string;
    virtualApiKeyId: string;
    lastChars: string;
}) {
    const t = useTranslations();
    const preview = keyPreview(virtualApiKeyId, lastChars);
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

function IdentityKeyCenterpiece({
    orgId,
    virtualApiKeyId,
    lastChars,
    resourceGuid
}: {
    orgId: string;
    virtualApiKeyId: string;
    lastChars: string;
    resourceGuid?: string;
}) {
    const t = useTranslations();
    const preview = keyPreview(virtualApiKeyId, lastChars);
    const { credential, loading, revealSecret } = useRevealSecret(
        orgId,
        virtualApiKeyId
    );
    const displayValue = credential ?? preview;
    const headline = resourceGuid
        ? t("myVirtualApiKeysIdentityResourceHeadline")
        : t("myVirtualApiKeysIdentityHeadline");
    const description = resourceGuid
        ? t("myVirtualApiKeysIdentityResourceDescription")
        : t("myVirtualApiKeysIdentityDescription");

    return (
        <div className="flex flex-col items-center text-center py-10 md:py-14 px-4">
            <h2 className="text-2xl font-semibold tracking-tight max-w-xl">
                {headline}
            </h2>
            <p className="mt-3 text-muted-foreground max-w-lg text-sm">
                {description}
            </p>
            <div className="mt-8 w-full max-w-2xl">
                <div className="[&_pre]:text-base [&_code]:font-mono [&_code]:tracking-wide">
                    <CopyTextBox text={displayValue} wrapText={false} />
                </div>
                {!credential ? (
                    <div className="mt-3 flex justify-center">
                        <Button
                            variant="link"
                            className="px-0 h-auto"
                            loading={loading}
                            onClick={revealSecret}
                        >
                            {t("myVirtualApiKeysRevealSecret")}
                        </Button>
                    </div>
                ) : null}
            </div>
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
        <div className="flex flex-col gap-3 border rounded-md p-4">
            <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium truncate">
                        {keyRow.name || t("myVirtualApiKeysUnnamed")}
                    </p>
                </div>
                {keyRow.description ? (
                    <p className="text-sm text-muted-foreground">
                        {keyRow.description}
                    </p>
                ) : null}
                <div className="pt-1">
                    <OwnedKeySecret
                        orgId={orgId}
                        virtualApiKeyId={keyRow.virtualApiKeyId}
                        lastChars={keyRow.lastChars}
                    />
                </div>
                <p className="text-xs text-muted-foreground">
                    {t("created")} {moment(keyRow.createdAt).format("lll")}
                </p>
            </div>
        </div>
    );
}

export default function UserVirtualApiKeys({
    orgId,
    resourceGuid,
    initialData
}: UserVirtualApiKeysProps) {
    const t = useTranslations();

    const title = resourceGuid
        ? t("myVirtualApiKeysResourceTitle")
        : t("myVirtualApiKeysTitle");
    const description = resourceGuid
        ? t("myVirtualApiKeysResourceDescription")
        : t("myVirtualApiKeysDescription");

    return (
        <>
            <SettingsContainer>
                <IdentityKeyCenterpiece
                    orgId={orgId}
                    virtualApiKeyId={initialData.userKey.virtualApiKeyId}
                    lastChars={initialData.userKey.lastChars}
                    resourceGuid={resourceGuid}
                />

                {initialData.manualKeys.length > 0 ? (
                    <SettingsSection>
                        <SettingsSectionHeader>
                            <SectionTitle>
                                {t("myVirtualApiKeysManualTitle")}
                            </SectionTitle>
                            <SettingsSectionDescription>
                                {resourceGuid
                                    ? t(
                                          "myVirtualApiKeysManualResourceDescription"
                                      )
                                    : t("myVirtualApiKeysManualDescription")}
                            </SettingsSectionDescription>
                        </SettingsSectionHeader>
                        <SettingsSectionBody>
                            <SettingsFormGrid>
                                {initialData.manualKeys.map((keyRow) => (
                                    <SettingsFormCell
                                        key={keyRow.virtualApiKeyId}
                                        span="half"
                                    >
                                        <ManualKeyRow
                                            orgId={orgId}
                                            keyRow={keyRow}
                                        />
                                    </SettingsFormCell>
                                ))}
                            </SettingsFormGrid>
                        </SettingsSectionBody>
                    </SettingsSection>
                ) : null}
            </SettingsContainer>
        </>
    );
}
