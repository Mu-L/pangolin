"use client";

import {
    SettingsContainer,
    SettingsSection,
    SettingsSectionBody,
    SettingsSectionDescription,
    SettingsSectionForm,
    SettingsSectionHeader,
    SettingsSectionTitle,
    SettingsSubsectionDescription,
    SettingsSubsectionHeader,
    SettingsSubsectionTitle
} from "@app/components/Settings";
import { StrategySelect, StrategyOption } from "@app/components/StrategySelect";
import { BrowserGatewayTargetForm } from "@app/components/BrowserGatewayTargetForm";
import { PaidFeaturesAlert } from "@app/components/PaidFeaturesAlert";
import {
    SitesSelector,
    type Selectedsite
} from "@app/components/site-selector";
import { usePaidStatus } from "@app/hooks/usePaidStatus";
import { tierMatrix, TierFeature } from "@server/lib/billing/tierMatrix";
import { Button } from "@app/components/ui/button";
import { Input } from "@app/components/ui/input";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@app/components/ui/form";
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@app/components/ui/popover";
import { ChevronsUpDown, ExternalLink } from "lucide-react";
import { Badge } from "@app/components/ui/badge";
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
    targetId: number;
    siteId: number;
    authToken?: string | null;
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
    const { isPaidUser } = usePaidStatus();
    const disabled = !isPaidUser(
        tierMatrix[TierFeature.AdvancedPublicResources]
    );

    return (
        <SettingsContainer>
            <PaidFeaturesAlert
                tiers={tierMatrix[TierFeature.AdvancedPublicResources]}
            />
            <SshServerForm
                orgId={params.orgId}
                resource={resource}
                updateResource={updateResource}
                disabled={disabled}
            />
        </SettingsContainer>
    );
}

function SshServerForm({
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

    const isNativeInitially = resource.authDaemonMode === "native";

    const [sshServerMode, setSshServerMode] = useState<"standard" | "native">(
        isNativeInitially ? "native" : "standard"
    );
    const isNative = sshServerMode === "native";

    const [pamMode, setPamMode] = useState<"passthrough" | "push">(
        (resource.pamMode as "passthrough" | "push") || "passthrough"
    );

    const [standardDaemonLocation, setStandardDaemonLocation] = useState<
        "site" | "remote"
    >(
        isNativeInitially
            ? "site"
            : (resource.authDaemonMode as "site" | "remote") || "site"
    );

    const form = useForm({
        resolver: zodResolver(sshFormSchema),
        defaultValues: {
            authDaemonPort: (resource as any).authDaemonPort
                ? String((resource as any).authDaemonPort)
                : "22123"
        }
    });

    // Standard mode: multi-site
    const [selectedSites, setSelectedSites] = useState<Selectedsite[]>([]);
    const [selectedSite, setSelectedSite] = useState<Selectedsite | null>(null);
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
    const [nativeSiteOpen, setNativeSiteOpen] = useState(false);

    const { data: bgTargetsResponse } = useQuery({
        queryKey: ["resourceTargets", resource.resourceId, orgId, "ssh"],
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
                    authToken?: string | null;
                }>;
            };
        }
    });

    useEffect(() => {
        if (!bgTargetsResponse?.targets?.length) return;
        const targets = bgTargetsResponse.targets.filter(
            (t) => t.mode === "ssh"
        );
        if (!targets.length) return;
        const first = targets[0];
        if (isNativeInitially) {
            setSelectedNativeSite({
                siteId: first.siteId,
                name: first.siteName ?? String(first.siteId),
                type: "newt" as const
            });
            setNativeExistingTarget({
                targetId: first.targetId,
                siteId: first.siteId,
                authToken: first.authToken
            });
        } else {
            setBgDestination(first.ip);
            setBgDestinationPort(String(first.port));
            setExistingTargets(
                targets.map((t) => ({
                    targetId: t.targetId,
                    siteId: t.siteId,
                    authToken: t.authToken
                }))
            );
            setSelectedSites(
                targets.map((t) => ({
                    siteId: t.siteId,
                    name: t.siteName ?? String(t.siteId),
                    type: "newt" as const
                }))
            );
        }
    }, [bgTargetsResponse]);

    const [, formAction, isSubmitting] = useActionState(save, null);

    async function save() {
        const isValid = await form.trigger();
        if (!isValid) return;

        const effectiveMode = isNative ? "native" : standardDaemonLocation;
        const portVal = form.getValues().authDaemonPort;
        const effectivePort =
            !isNative && standardDaemonLocation === "remote" && portVal
                ? Number(portVal)
                : null;

        try {
            await api.post(`/resource/${resource.resourceId}`, {
                pamMode,
                authDaemonMode: effectiveMode,
                authDaemonPort: effectivePort
            });

            updateResource({
                ...resource,
                pamMode,
                authDaemonMode: effectiveMode
            });

            if (isNative) {
                if (selectedNativeSite) {
                    if (nativeExistingTarget) {
                        await api.post(
                            `/target/${nativeExistingTarget.targetId}`,
                            {
                                mode: "ssh",
                                ip: "localhost",
                                port: 22,
                                siteId: selectedNativeSite.siteId,
                                authToken: nativeExistingTarget.authToken,
                                hcEnabled: false
                            }
                        );
                    } else {
                        const res = await api.put(
                            `/resource/${resource.resourceId}/target`,
                            {
                                siteId: selectedNativeSite.siteId,
                                mode: "ssh",
                                ip: "localhost",
                                port: 22,
                                hcEnabled: false
                            }
                        );
                        setNativeExistingTarget({
                            targetId: res.data.data.targetId,
                            siteId: selectedNativeSite.siteId,
                            authToken: res.data.data.authToken
                        });
                    }
                }
            } else {
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
                                    mode: "ssh",
                                    ip: bgDestination,
                                    port: Number(bgDestinationPort),
                                    siteId: t.siteId,
                                    authToken: t.authToken,
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
                                    mode: "ssh",
                                    ip: bgDestination,
                                    port: Number(bgDestinationPort),
                                    hcEnabled: false
                                }
                            )
                        )
                    );

                    const newTargets: ExistingTarget[] = created.map(
                        (res, i) => ({
                            targetId: res.data.data.targetId,
                            siteId: toCreate[i].siteId,
                            authToken: res.data.data.authToken
                        })
                    );
                    setExistingTargets([...toUpdate, ...newTargets]);
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

    const showDaemonLocation = !isNative && pamMode === "push";
    const showDaemonPort =
        !isNative && pamMode === "push" && standardDaemonLocation === "remote";

    return (
        <SettingsSection>
            <SettingsSectionHeader>
                <SettingsSectionTitle>{t("sshServer")}</SettingsSectionTitle>
                <SettingsSectionDescription>
                    {t("sshServerDescription")}
                </SettingsSectionDescription>
            </SettingsSectionHeader>
            <fieldset
                disabled={disabled}
                className={disabled ? "opacity-50 pointer-events-none" : ""}
            >
            <SettingsSectionBody>
                <SettingsSectionForm variant="half">
                    <div className="space-y-3">
                        <SettingsSubsectionTitle>
                            {t("sshServerMode")}
                        </SettingsSubsectionTitle>
                        <Badge variant="secondary">
                            {sshServerMode == "standard"
                                ? t("sshServerModeStandard")
                                : t("sshServerModePangolin")}
                        </Badge>
                    </div>

                    <div className="space-y-3">
                        <SettingsSubsectionTitle>
                            {t("sshAuthenticationMethod")}
                        </SettingsSubsectionTitle>
                        <StrategySelect<"passthrough" | "push">
                            value={pamMode}
                            options={authMethodOptions}
                            onChange={setPamMode}
                            cols={2}
                        />
                    </div>

                    {showDaemonLocation && (
                        <div className="space-y-3">
                            <SettingsSubsectionTitle>
                                {t("sshAuthDaemonLocation")}
                            </SettingsSubsectionTitle>
                            <StrategySelect<"site" | "remote">
                                value={standardDaemonLocation}
                                options={daemonLocationOptions}
                                onChange={setStandardDaemonLocation}
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
                    )}

                    {showDaemonPort && (
                        <Form {...form}>
                            <FormField
                                control={form.control}
                                name="authDaemonPort"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>
                                            {t("sshDaemonPort")}
                                        </FormLabel>
                                        <FormControl>
                                            <Input
                                                type="number"
                                                min={1}
                                                max={65535}
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </Form>
                    )}

                    <div className="space-y-3">
                        <SettingsSubsectionHeader>
                            <SettingsSubsectionTitle>
                                {t("sshServerDestination")}
                            </SettingsSubsectionTitle>
                            <SettingsSubsectionDescription>
                                {t("sshServerDestinationDescription")}
                            </SettingsSubsectionDescription>
                        </SettingsSubsectionHeader>
                        {isNative ? (
                            <Popover
                                open={nativeSiteOpen}
                                onOpenChange={setNativeSiteOpen}
                            >
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        className="w-full max-w-xs justify-between font-normal"
                                    >
                                        <span className="truncate">
                                            {selectedNativeSite?.name ??
                                                t("siteSelect")}
                                        </span>
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                                    <SitesSelector
                                        orgId={orgId}
                                        selectedSite={selectedNativeSite}
                                        onSelectSite={(site) => {
                                            setSelectedNativeSite(site);
                                            setNativeSiteOpen(false);
                                        }}
                                    />
                                </PopoverContent>
                            </Popover>
                        ) : standardDaemonLocation !== "site" ||
                          pamMode === "passthrough" ? (
                            <BrowserGatewayTargetForm
                                orgId={orgId}
                                multiSite={true}
                                selectedSites={selectedSites}
                                onSitesChange={setSelectedSites}
                                destination={bgDestination}
                                destinationPort={bgDestinationPort}
                                onDestinationChange={setBgDestination}
                                onDestinationPortChange={setBgDestinationPort}
                                learnMoreHref="https://docs.pangolin.net/manage/resources/public/ssh"
                                defaultPort={22}
                            />
                        ) : (
                            <BrowserGatewayTargetForm
                                orgId={orgId}
                                multiSite={false}
                                selectedSite={selectedSite}
                                onSiteChange={setSelectedSite}
                                destination={bgDestination}
                                destinationPort={bgDestinationPort}
                                onDestinationChange={setBgDestination}
                                onDestinationPortChange={setBgDestinationPort}
                                learnMoreHref="https://docs.pangolin.net/manage/resources/public/ssh"
                                defaultPort={22}
                            />
                        )}
                    </div>
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
