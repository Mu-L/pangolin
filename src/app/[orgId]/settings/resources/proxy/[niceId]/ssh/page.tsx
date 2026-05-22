"use client";

import {
    SettingsContainer,
    SettingsSection,
    SettingsSectionBody,
    SettingsSectionDescription,
    SettingsSectionHeader,
    SettingsSectionTitle
} from "@app/components/Settings";
import { StrategySelect, StrategyOption } from "@app/components/StrategySelect";
import { Button } from "@app/components/ui/button";
import { Input } from "@app/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@app/components/ui/select";
import { ExternalLink } from "lucide-react";
import { toast } from "@app/hooks/useToast";
import { useResourceContext } from "@app/hooks/useResourceContext";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { createApiClient } from "@app/lib/api";
import { formatAxiosError } from "@app/lib/api/formatAxiosError";
import { orgQueries } from "@app/lib/queries";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { use, useActionState, useEffect, useState } from "react";
import { GetResourceResponse } from "@server/routers/resource";
import type { ResourceContextType } from "@app/contexts/resourceContext";

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

    const [pamMode, setPamMode] = useState<"passthrough" | "push">(
        (resource.pamMode as "passthrough" | "push") || "passthrough"
    );
    const [authDaemonMode, setAuthDaemonMode] = useState<"site" | "remote">(
        (resource.authDaemonMode as "site" | "remote") || "site"
    );
    const [authDaemonPort, setAuthDaemonPort] = useState<string>(
        (resource as any).authDaemonPort
            ? String((resource as any).authDaemonPort)
            : "22123"
    );

    const [bgDestination, setBgDestination] = useState("");
    const [bgDestinationPort, setBgDestinationPort] = useState("22");
    const [bgSiteId, setBgSiteId] = useState<number | null>(null);
    const [bgTargetId, setBgTargetId] = useState<number | null>(null);

    const { data: sites = [] } = useQuery(orgQueries.sites({ orgId }));

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
                    type: string;
                    destination: string;
                    destinationPort: number;
                }>;
            };
        }
    });

    useEffect(() => {
        if (!bgTargetsResponse?.targets?.length) return;
        const bgt = bgTargetsResponse.targets[0];
        setBgDestination(bgt.destination);
        setBgDestinationPort(String(bgt.destinationPort));
        setBgSiteId(bgt.siteId);
        setBgTargetId(bgt.browserGatewayTargetId);
    }, [bgTargetsResponse]);

    useEffect(() => {
        if (sites.length > 0 && bgSiteId === null) {
            setBgSiteId(sites[0].siteId);
        }
    }, [sites, bgSiteId]);

    const [, formAction, isSubmitting] = useActionState(save, null);

    async function save() {
        try {
            await api.post(`/resource/${resource.resourceId}`, {
                pamMode,
                authDaemonMode,
                authDaemonPort: authDaemonPort ? Number(authDaemonPort) : null
            });

            updateResource({ ...resource, pamMode, authDaemonMode });

            if (bgDestination && bgDestinationPort) {
                if (bgTargetId) {
                    await api.post(
                        `/org/${orgId}/browser-gateway-target/${bgTargetId}`,
                        {
                            type: "ssh",
                            destination: bgDestination,
                            destinationPort: Number(bgDestinationPort),
                            siteId: bgSiteId
                        }
                    );
                } else {
                    const res = await api.put(
                        `/org/${orgId}/resource/${resource.resourceId}/browser-gateway-target`,
                        {
                            siteId: bgSiteId ?? sites[0]?.siteId,
                            type: "ssh",
                            destination: bgDestination,
                            destinationPort: Number(bgDestinationPort)
                        }
                    );
                    setBgTargetId(res.data.data.browserGatewayTargetId);
                }
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

    const authMethodOptions: StrategyOption<"passthrough" | "push">[] = [
        {
            id: "passthrough",
            title: t("sshAuthMethodManual"),
            description: t("sshAuthMethodManualDescription")
        },
        {
            id: "push",
            title: t("sshAuthMethodAutomated"),
            description: t("sshAuthMethodAutomatedDescription")
        }
    ];

    const daemonLocationOptions: StrategyOption<"site" | "remote">[] = [
        {
            id: "site",
            title: t("internalResourceAuthDaemonSite"),
            description: t("sshDaemonLocationSiteDescription")
        },
        {
            id: "remote",
            title: t("sshDaemonLocationRemote"),
            description: t("sshDaemonLocationRemoteDescription")
        }
    ];

    return (
        <>
            <SettingsSection>
                <SettingsSectionHeader>
                    <SettingsSectionTitle>
                        {t("sshServer")}
                    </SettingsSectionTitle>
                    <SettingsSectionDescription>
                        {t("sshServerDescription")}
                    </SettingsSectionDescription>
                </SettingsSectionHeader>
                <SettingsSectionBody>
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <p className="text-sm font-semibold">
                                {t("sshServerMode")}
                            </p>
                            <span className="inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-medium">
                                {t("sshServerModeStandard")}
                            </span>
                        </div>

                        <div className="space-y-3">
                            <p className="text-sm font-semibold">
                                {t("sshAuthenticationMethod")}
                            </p>
                            <StrategySelect<"passthrough" | "push">
                                value={pamMode}
                                options={authMethodOptions}
                                onChange={setPamMode}
                                cols={2}
                            />
                        </div>

                        <div className="space-y-3">
                            <p className="text-sm font-semibold">
                                {t("sshAuthDaemonLocation")}
                            </p>
                            <StrategySelect<"site" | "remote">
                                value={authDaemonMode}
                                options={daemonLocationOptions}
                                onChange={setAuthDaemonMode}
                                cols={2}
                            />
                            <p className="text-sm text-muted-foreground">
                                {t("sshDaemonDisclaimer")}{" "}
                                <a
                                    href="https://docs.pangolin.net/manage/resources/public/ssh"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary hover:underline inline-flex items-center gap-1"
                                >
                                    {t("learnMore")}
                                    <ExternalLink className="size-3.5 shrink-0" />
                                </a>
                            </p>
                        </div>

                        <div className="space-y-2 max-w-xs">
                            <label className="text-sm font-semibold">
                                {t("sshDaemonPort")}
                            </label>
                            <Input
                                type="number"
                                min={1}
                                max={65535}
                                value={authDaemonPort}
                                onChange={(e) =>
                                    setAuthDaemonPort(e.target.value)
                                }
                            />
                        </div>
                    </div>
                </SettingsSectionBody>
            </SettingsSection>

            <SettingsSection>
                <SettingsSectionHeader>
                    <SettingsSectionTitle>
                        {t("sshServerDestination")}
                    </SettingsSectionTitle>
                    <SettingsSectionDescription>
                        {t("sshServerDestinationDescription")}
                    </SettingsSectionDescription>
                </SettingsSectionHeader>
                <SettingsSectionBody>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold">
                                    {t("destination")}
                                </label>
                                <Input
                                    placeholder="192.168.1.1"
                                    value={bgDestination}
                                    onChange={(e) =>
                                        setBgDestination(e.target.value)
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold">
                                    {t("port")}
                                </label>
                                <Input
                                    type="number"
                                    placeholder="22"
                                    value={bgDestinationPort}
                                    onChange={(e) =>
                                        setBgDestinationPort(e.target.value)
                                    }
                                />
                            </div>
                        </div>
                        {sites.length > 0 && (
                            <div className="space-y-2">
                                <label className="text-sm font-semibold">
                                    {t("site")}
                                </label>
                                <Select
                                    value={bgSiteId ? String(bgSiteId) : ""}
                                    onValueChange={(v) =>
                                        setBgSiteId(Number(v))
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue
                                            placeholder={t("siteSelect")}
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {sites.map((site) => (
                                            <SelectItem
                                                key={site.siteId}
                                                value={String(site.siteId)}
                                            >
                                                {site.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>
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
        </>
    );
}
