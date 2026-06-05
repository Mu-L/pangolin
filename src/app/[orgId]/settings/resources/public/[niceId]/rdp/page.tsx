"use client";

import {
    SettingsContainer,
    SettingsSection,
    SettingsSectionBody,
    SettingsSectionDescription,
    SettingsSectionForm,
    SettingsSectionHeader,
    SettingsSectionTitle
} from "@app/components/Settings";
import { BrowserGatewayTargetForm } from "@app/components/BrowserGatewayTargetForm";
import { PaidFeaturesAlert } from "@app/components/PaidFeaturesAlert";
import { type Selectedsite } from "@app/components/site-selector";
import { Button } from "@app/components/ui/button";
import { toast } from "@app/hooks/useToast";
import { useResourceContext } from "@app/hooks/useResourceContext";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { usePaidStatus } from "@app/hooks/usePaidStatus";
import { tierMatrix, TierFeature } from "@server/lib/billing/tierMatrix";
import { createApiClient } from "@app/lib/api";
import { formatAxiosError } from "@app/lib/api/formatAxiosError";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { use, useActionState, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { GetResourceResponse } from "@server/routers/resource";
import type { ResourceContextType } from "@app/contexts/resourceContext";

type ExistingTarget = {
    targetId: number;
    siteId: number;
};

export default function SshSettingsPage(props: {
    params: Promise<{ orgId: string }>;
}) {
    const params = use(props.params);
    const { resource, updateResource } = useResourceContext();
    const { isPaidUser } = usePaidStatus();
    const disabled = !isPaidUser(
        tierMatrix[TierFeature.AdvancedPublicResources]
    );

    return (
        <SettingsContainer>
            <PaidFeaturesAlert
                tiers={tierMatrix[TierFeature.AdvancedPublicResources]}
            />
            <RdpServerForm
                orgId={params.orgId}
                resource={resource}
                updateResource={updateResource}
                disabled={disabled}
            />
        </SettingsContainer>
    );
}

function RdpServerForm({
    orgId,
    resource,
    updateResource,
    disabled
}: {
    orgId: string;
    resource: GetResourceResponse;
    updateResource: ResourceContextType["updateResource"];
    disabled: boolean;
}) {
    const t = useTranslations();
    const api = createApiClient(useEnvContext());
    const router = useRouter();

    // Standard mode: multi-site
    const [selectedSites, setSelectedSites] = useState<Selectedsite[]>([]);
    const [bgDestination, setBgDestination] = useState("");
    const [bgDestinationPort, setBgDestinationPort] = useState("22");
    const [existingTargets, setExistingTargets] = useState<ExistingTarget[]>(
        []
    );

    // Native mode: single site
    const [selectedNativeSite, setSelectedNativeSite] =
        useState<Selectedsite | null>(null);
    const [nativeExistingTarget, setNativeExistingTarget] =
        useState<ExistingTarget | null>(null);

    const { data: bgTargetsResponse } = useQuery({
        queryKey: ["resourceTargets", resource.resourceId, orgId, "rdp"],
        queryFn: async () => {
            const res = await api.get(`/resource/${resource.resourceId}/targets`);
            return res.data.data as {
                targets: Array<{
                    targetId: number;
                    resourceId: number;
                    siteId: number;
                    siteName?: string;
                    mode: string | null;
                    ip: string;
                    port: number;
                }>;
            };
        }
    });

    useEffect(() => {
        if (!bgTargetsResponse?.targets?.length) return;
        const targets = bgTargetsResponse.targets.filter(
            (t) => t.mode === "rdp"
        );
        if (!targets.length) return;
        const first = targets[0];

        setBgDestination(first.ip);
        setBgDestinationPort(String(first.port));
        setExistingTargets(
            targets.map((t) => ({
                targetId: t.targetId,
                siteId: t.siteId
            }))
        );
        setSelectedSites(
            targets.map((t) => ({
                siteId: t.siteId,
                name: t.siteName ?? String(t.siteId),
                type: "newt" as const
            }))
        );
    }, [bgTargetsResponse]);

    const [, formAction, isSubmitting] = useActionState(save, null);

    async function save() {
        try {
            if (bgDestination && bgDestinationPort) {
                const selectedSiteIds = new Set(
                    selectedSites.map((s) => s.siteId)
                );
                const existingSiteIds = new Set(
                    existingTargets.map((t) => t.siteId)
                );

                const toDelete = existingTargets.filter(
                    (t) => !selectedSiteIds.has(t.siteId)
                );
                await Promise.all(
                    toDelete.map((t) =>
                        api.delete(`/target/${t.targetId}`)
                    )
                );

                const toUpdate = existingTargets.filter((t) =>
                    selectedSiteIds.has(t.siteId)
                );
                await Promise.all(
                    toUpdate.map((t) =>
                        api.post(
                            `/target/${t.targetId}`,
                            {
                                mode: "rdp",
                                ip: bgDestination,
                                port: Number(bgDestinationPort),
                                siteId: t.siteId,
                                hcEnabled: false
                            }
                        )
                    )
                );

                const toCreate = selectedSites.filter(
                    (s) => !existingSiteIds.has(s.siteId)
                );
                const created = await Promise.all(
                    toCreate.map((s) =>
                        api.put(
                            `/resource/${resource.resourceId}/target`,
                            {
                                siteId: s.siteId,
                                mode: "rdp",
                                ip: bgDestination,
                                port: Number(bgDestinationPort),
                                hcEnabled: false
                            }
                        )
                    )
                );

                const newTargets: ExistingTarget[] = created.map((res, i) => ({
                    targetId: res.data.data.targetId,
                    siteId: toCreate[i].siteId
                }));
                setExistingTargets([...toUpdate, ...newTargets]);
            }

            toast({
                title: t("settingsUpdated"),
                description: t("settingsUpdatedDescription")
            });
            router.refresh();
        } catch (err) {
            console.error(err);
            toast({
                variant: "destructive",
                title: t("settingsErrorUpdate"),
                description: formatAxiosError(
                    err,
                    t("settingsErrorUpdateDescription")
                )
            });
        }
    }

    return (
        <SettingsSection>
            <SettingsSectionHeader>
                <SettingsSectionTitle>{t("rdpServer")}</SettingsSectionTitle>
                <SettingsSectionDescription>
                    {t("rdpServerDescription")}
                </SettingsSectionDescription>
            </SettingsSectionHeader>
            <fieldset
                disabled={disabled}
                className={disabled ? "opacity-50 pointer-events-none" : ""}
            >
                <SettingsSectionBody>
                    <SettingsSectionForm variant="half">
                        <BrowserGatewayTargetForm
                            orgId={orgId}
                            multiSite={true}
                            selectedSites={selectedSites}
                            onSitesChange={setSelectedSites}
                            destination={bgDestination}
                            destinationPort={bgDestinationPort}
                            onDestinationChange={setBgDestination}
                            onDestinationPortChange={setBgDestinationPort}
                            learnMoreHref="https://docs.pangolin.net/manage/resources/public/rdp"
                            defaultPort={3389}
                        />
                    </SettingsSectionForm>
                </SettingsSectionBody>
                <form action={formAction} className="flex justify-end mt-4">
                    <Button
                        disabled={isSubmitting}
                        loading={isSubmitting}
                        type="submit"
                    >
                        {t("saveSettings")}
                    </Button>
                </form>
            </fieldset>
        </SettingsSection>
    );
}
