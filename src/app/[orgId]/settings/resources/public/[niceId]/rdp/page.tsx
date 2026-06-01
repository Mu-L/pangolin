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
import { type Selectedsite } from "@app/components/site-selector";
import { Button } from "@app/components/ui/button";
import { toast } from "@app/hooks/useToast";
import { useResourceContext } from "@app/hooks/useResourceContext";
import { useEnvContext } from "@app/hooks/useEnvContext";
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
    browserGatewayTargetId: number;
    siteId: number;
};

const sshFormSchema = z.object({
    authDaemonPort: z.string().refine(
        (val) => {
            if (!val) return true;
            const n = Number(val);
            return Number.isInteger(n) && n >= 1 && n <= 65535;
        },
        { message: "Port must be between 1 and 65535" }
    )
});

export default function SshSettingsPage(props: {
    params: Promise<{ orgId: string }>;
}) {
    const params = use(props.params);
    const { resource, updateResource } = useResourceContext();

    return (
        <SettingsContainer>
            <SshServerForm
                orgId={params.orgId}
                resource={resource}
                updateResource={updateResource}
            />
        </SettingsContainer>
    );
}

function SshServerForm({
    orgId,
    resource,
    updateResource
}: {
    orgId: string;
    resource: GetResourceResponse;
    updateResource: ResourceContextType["updateResource"];
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
        queryKey: ["browserGatewayTargets", resource.resourceId, orgId],
        queryFn: async () => {
            const res = await api.get(
                `/org/${orgId}/resource/${resource.resourceId}/browser-gateway-targets`
            );
            return res.data.data as {
                targets: Array<{
                    browserGatewayTargetId: number;
                    resourceId: number;
                    siteId: number;
                    siteName?: string;
                    type: string;
                    destination: string;
                    destinationPort: number;
                }>;
            };
        }
    });

    useEffect(() => {
        if (!bgTargetsResponse?.targets?.length) return;
        const targets = bgTargetsResponse.targets;
        const first = targets[0];

        setBgDestination(first.destination);
        setBgDestinationPort(String(first.destinationPort));
        setExistingTargets(
            targets.map((t) => ({
                browserGatewayTargetId: t.browserGatewayTargetId,
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
                        api.delete(
                            `/org/${orgId}/browser-gateway-target/${t.browserGatewayTargetId}`
                        )
                    )
                );

                const toUpdate = existingTargets.filter((t) =>
                    selectedSiteIds.has(t.siteId)
                );
                await Promise.all(
                    toUpdate.map((t) =>
                        api.post(
                            `/org/${orgId}/browser-gateway-target/${t.browserGatewayTargetId}`,
                            {
                                type: "rdp",
                                destination: bgDestination,
                                destinationPort: Number(bgDestinationPort),
                                siteId: t.siteId
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
                            `/org/${orgId}/resource/${resource.resourceId}/browser-gateway-target`,
                            {
                                siteId: s.siteId,
                                type: "rdp",
                                destination: bgDestination,
                                destinationPort: Number(bgDestinationPort)
                            }
                        )
                    )
                );

                const newTargets: ExistingTarget[] = created.map((res, i) => ({
                    browserGatewayTargetId:
                        res.data.data.browserGatewayTargetId,
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
        </SettingsSection>
    );
}
