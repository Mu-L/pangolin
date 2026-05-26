"use client";

import HealthCheckCredenza from "@/components/HealthCheckCredenza";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { HeadersInput } from "@app/components/HeadersInput";
import {
    PathMatchDisplay,
    PathMatchModal,
    PathRewriteDisplay,
    PathRewriteModal
} from "@app/components/PathMatchRenameModal";
import { ResourceTargetAddressItem } from "@app/components/resource-target-address-item";
import {
    SettingsContainer,
    SettingsSection,
    SettingsSectionBody,
    SettingsSectionDescription,
    SettingsSectionForm,
    SettingsSectionHeader,
    SettingsSectionTitle
} from "@app/components/Settings";
import { SwitchInput } from "@app/components/SwitchInput";
import { Alert, AlertDescription } from "@app/components/ui/alert";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@app/components/ui/form";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@app/components/ui/table";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger
} from "@app/components/ui/tooltip";
import type { ResourceContextType } from "@app/contexts/resourceContext";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useResourceContext } from "@app/hooks/useResourceContext";
import { toast } from "@app/hooks/useToast";
import { createApiClient } from "@app/lib/api";
import { formatAxiosError } from "@app/lib/api/formatAxiosError";
import { DockerManager, DockerState } from "@app/lib/docker";
import { orgQueries, resourceQueries } from "@app/lib/queries";
import { zodResolver } from "@hookform/resolvers/zod";
import { build } from "@server/build";
import { tlsNameSchema } from "@server/lib/schemas";
import { type GetResourceResponse } from "@server/routers/resource";
import type { ListSitesResponse } from "@server/routers/site";
import { CreateTargetResponse } from "@server/routers/target";
import { ListTargetsResponse } from "@server/routers/target/listTargets";
import { ArrayElement } from "@server/types/ArrayElement";
import { useQuery } from "@tanstack/react-query";
import {
    LocalTarget,
    ProxyResourceTargetsForm
} from "@app/app/[orgId]/settings/resources/proxy/ProxyResourceTargetsForm";
import {
    ColumnDef,
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable
} from "@tanstack/react-table";
import { AxiosResponse } from "axios";
import {
    AlertTriangle,
    CircleCheck,
    CircleX,
    ExternalLink,
    Info,
    Plus,
    Settings
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
    use,
    useActionState,
    useCallback,
    useEffect,
    useMemo,
    useState
} from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const targetsSettingsSchema = z.object({
    stickySession: z.boolean()
});

export default function ReverseProxyTargetsPage(props: {
    params: Promise<{ resourceId: number; orgId: string }>;
}) {
    const params = use(props.params);
    const { resource, updateResource } = useResourceContext();

    const { data: remoteTargets = [], isLoading: isLoadingTargets } = useQuery(
        resourceQueries.resourceTargets({
            resourceId: resource.resourceId
        })
    );

    if (isLoadingTargets) {
        return null;
    }

    return (
        <SettingsContainer>
            <ProxyResourceTargetsForm
                orgId={params.orgId}
                isHttp={resource.http}
                initialTargets={remoteTargets}
                resource={resource}
                updateResource={updateResource}
            />

            {resource.http && (
                <ProxyResourceHttpForm
                    resource={resource}
                    updateResource={updateResource}
                />
            )}

            {!resource.http && resource.protocol == "tcp" && (
                <ProxyResourceProtocolForm
                    resource={resource}
                    updateResource={updateResource}
                />
            )}
        </SettingsContainer>
    );
}

function ProxyResourceHttpForm({
    resource,
    updateResource
}: Pick<ResourceContextType, "resource" | "updateResource">) {
    const t = useTranslations();

    const tlsSettingsSchema = z.object({
        ssl: z.boolean(),
        tlsServerName: z
            .string()
            .optional()
            .refine(
                (data) => {
                    if (data) {
                        return tlsNameSchema.safeParse(data).success;
                    }
                    return true;
                },
                {
                    message: t("proxyErrorTls")
                }
            )
    });

    const tlsSettingsForm = useForm({
        resolver: zodResolver(tlsSettingsSchema),
        defaultValues: {
            ssl: resource.ssl,
            tlsServerName: resource.tlsServerName || ""
        }
    });

    const proxySettingsSchema = z.object({
        setHostHeader: z
            .string()
            .optional()
            .refine(
                (data) => {
                    if (data) {
                        return tlsNameSchema.safeParse(data).success;
                    }
                    return true;
                },
                {
                    message: t("proxyErrorInvalidHeader")
                }
            ),
        headers: z
            .array(z.object({ name: z.string(), value: z.string() }))
            .nullable(),
        proxyProtocol: z.boolean().optional(),
        proxyProtocolVersion: z.int().min(1).max(2).optional()
    });

    const proxySettingsForm = useForm({
        resolver: zodResolver(proxySettingsSchema),
        defaultValues: {
            setHostHeader: resource.setHostHeader || "",
            headers: resource.headers,
            proxyProtocol: resource.proxyProtocol || false,
            proxyProtocolVersion: resource.proxyProtocolVersion || 1
        }
    });

    const { env } = useEnvContext();
    const api = createApiClient({ env });

    const targetsSettingsForm = useForm({
        resolver: zodResolver(targetsSettingsSchema),
        defaultValues: {
            stickySession: resource.stickySession
        }
    });

    const router = useRouter();
    const [, formAction, isSubmitting] = useActionState(
        saveResourceHttpSettings,
        null
    );

    async function saveResourceHttpSettings() {
        const isValidTLS = await tlsSettingsForm.trigger();
        const isValidProxy = await proxySettingsForm.trigger();
        const targetSettingsForm = await targetsSettingsForm.trigger();
        if (!isValidTLS || !isValidProxy || !targetSettingsForm) return;

        try {
            // Gather all settings
            const stickySessionData = targetsSettingsForm.getValues();
            const tlsData = tlsSettingsForm.getValues();
            const proxyData = proxySettingsForm.getValues();

            // Combine into one payload
            const payload = {
                stickySession: stickySessionData.stickySession,
                ssl: tlsData.ssl,
                tlsServerName: tlsData.tlsServerName || null,
                setHostHeader: proxyData.setHostHeader || null,
                headers: proxyData.headers || null
            };

            // Single API call to update all settings
            await api.post(`/resource/${resource.resourceId}`, payload);

            // Update local resource context
            updateResource({
                ...resource,
                stickySession: stickySessionData.stickySession,
                ssl: tlsData.ssl,
                tlsServerName: tlsData.tlsServerName || null,
                setHostHeader: proxyData.setHostHeader || null,
                headers: proxyData.headers || null
            });

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
                <SettingsSectionTitle>
                    {t("proxyAdditional")}
                </SettingsSectionTitle>
                <SettingsSectionDescription>
                    {t("proxyAdditionalDescription")}
                </SettingsSectionDescription>
            </SettingsSectionHeader>
            <SettingsSectionBody>
                <SettingsSectionForm>
                    <Form {...tlsSettingsForm}>
                        <form
                            action={formAction}
                            className="space-y-4"
                            id="tls-settings-form"
                        >
                            {!env.flags.usePangolinDns && (
                                <FormField
                                    control={tlsSettingsForm.control}
                                    name="ssl"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormControl>
                                                <SwitchInput
                                                    id="ssl-toggle"
                                                    label={t("proxyEnableSSL")}
                                                    description={t(
                                                        "proxyEnableSSLDescription"
                                                    )}
                                                    defaultChecked={field.value}
                                                    onCheckedChange={(val) => {
                                                        field.onChange(val);
                                                    }}
                                                />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                            )}
                            <FormField
                                control={tlsSettingsForm.control}
                                name="tlsServerName"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>
                                            {t("targetTlsSni")}
                                        </FormLabel>
                                        <FormControl>
                                            <Input {...field} />
                                        </FormControl>
                                        <FormDescription>
                                            {t("targetTlsSniDescription")}
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </form>
                    </Form>
                </SettingsSectionForm>

                <SettingsSectionForm>
                    <Form {...targetsSettingsForm}>
                        <form
                            action={formAction}
                            className="space-y-4"
                            id="targets-settings-form"
                        >
                            <FormField
                                control={targetsSettingsForm.control}
                                name="stickySession"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormControl>
                                            <SwitchInput
                                                id="sticky-toggle"
                                                label={t(
                                                    "targetStickySessions"
                                                )}
                                                description={t(
                                                    "targetStickySessionsDescription"
                                                )}
                                                defaultChecked={field.value}
                                                onCheckedChange={(val) => {
                                                    field.onChange(val);
                                                }}
                                            />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                        </form>
                    </Form>
                </SettingsSectionForm>

                <SettingsSectionForm>
                    <Form {...proxySettingsForm}>
                        <form
                            action={formAction}
                            className="space-y-4"
                            id="proxy-settings-form"
                        >
                            <FormField
                                control={proxySettingsForm.control}
                                name="setHostHeader"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>
                                            {t("proxyCustomHeader")}
                                        </FormLabel>
                                        <FormControl>
                                            <Input {...field} />
                                        </FormControl>
                                        <FormDescription>
                                            {t("proxyCustomHeaderDescription")}
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={proxySettingsForm.control}
                                name="headers"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>
                                            {t("customHeaders")}
                                        </FormLabel>
                                        <FormControl>
                                            <HeadersInput
                                                value={field.value}
                                                onChange={(value) => {
                                                    field.onChange(value);
                                                }}
                                                rows={4}
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            {t("customHeadersDescription")}
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </form>
                    </Form>
                </SettingsSectionForm>
                <form className="flex justify-end" action={formAction}>
                    <Button
                        disabled={isSubmitting}
                        loading={isSubmitting}
                        type="submit"
                    >
                        {t("saveResourceHttp")}
                    </Button>
                </form>
            </SettingsSectionBody>
        </SettingsSection>
    );
}

function ProxyResourceProtocolForm({
    resource,
    updateResource
}: Pick<ResourceContextType, "resource" | "updateResource">) {
    const t = useTranslations();

    const api = createApiClient(useEnvContext());

    const proxySettingsSchema = z.object({
        setHostHeader: z
            .string()
            .optional()
            .refine(
                (data) => {
                    if (data) {
                        return tlsNameSchema.safeParse(data).success;
                    }
                    return true;
                },
                {
                    message: t("proxyErrorInvalidHeader")
                }
            ),
        headers: z
            .array(z.object({ name: z.string(), value: z.string() }))
            .nullable(),
        proxyProtocol: z.boolean().optional(),
        proxyProtocolVersion: z.int().min(1).max(2).optional()
    });

    const proxySettingsForm = useForm({
        resolver: zodResolver(proxySettingsSchema),
        defaultValues: {
            setHostHeader: resource.setHostHeader || "",
            headers: resource.headers,
            proxyProtocol: resource.proxyProtocol || false,
            proxyProtocolVersion: resource.proxyProtocolVersion || 1
        }
    });

    const router = useRouter();

    const [, formAction, isSubmitting] = useActionState(
        saveProtocolSettings,
        null
    );

    async function saveProtocolSettings() {
        const isValid = proxySettingsForm.trigger();
        if (!isValid) return;

        try {
            // For TCP/UDP resources, save proxy protocol settings
            const proxyData = proxySettingsForm.getValues();

            const payload = {
                proxyProtocol: proxyData.proxyProtocol || false,
                proxyProtocolVersion: proxyData.proxyProtocolVersion || 1
            };

            await api.post(`/resource/${resource.resourceId}`, payload);

            updateResource({
                ...resource,
                proxyProtocol: proxyData.proxyProtocol || false,
                proxyProtocolVersion: proxyData.proxyProtocolVersion || 1
            });

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
                <SettingsSectionTitle>
                    {t("proxyProtocol")}
                </SettingsSectionTitle>
                <SettingsSectionDescription>
                    {t("proxyProtocolDescription")}
                </SettingsSectionDescription>
            </SettingsSectionHeader>
            <SettingsSectionBody>
                <SettingsSectionForm>
                    <Form {...proxySettingsForm}>
                        <form
                            action={formAction}
                            className="space-y-4"
                            id="proxy-protocol-settings-form"
                        >
                            <FormField
                                control={proxySettingsForm.control}
                                name="proxyProtocol"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormControl>
                                            <SwitchInput
                                                id="proxy-protocol-toggle"
                                                label={t("enableProxyProtocol")}
                                                description={t(
                                                    "proxyProtocolInfo"
                                                )}
                                                defaultChecked={
                                                    field.value || false
                                                }
                                                onCheckedChange={(val) => {
                                                    field.onChange(val);
                                                }}
                                            />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />

                            {proxySettingsForm.watch("proxyProtocol") && (
                                <>
                                    <FormField
                                        control={proxySettingsForm.control}
                                        name="proxyProtocolVersion"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>
                                                    {t("proxyProtocolVersion")}
                                                </FormLabel>
                                                <FormControl>
                                                    <Select
                                                        value={String(
                                                            field.value || 1
                                                        )}
                                                        onValueChange={(
                                                            value
                                                        ) =>
                                                            field.onChange(
                                                                parseInt(
                                                                    value,
                                                                    10
                                                                )
                                                            )
                                                        }
                                                    >
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select version" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="1">
                                                                {t("version1")}
                                                            </SelectItem>
                                                            <SelectItem value="2">
                                                                {t("version2")}
                                                            </SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </FormControl>
                                                <FormDescription>
                                                    {t("versionDescription")}
                                                </FormDescription>
                                            </FormItem>
                                        )}
                                    />

                                    <Alert>
                                        <AlertTriangle className="h-4 w-4" />
                                        <AlertDescription>
                                            <strong>{t("warning")}:</strong>{" "}
                                            {t("proxyProtocolWarning")}
                                        </AlertDescription>
                                    </Alert>
                                </>
                            )}
                        </form>
                    </Form>
                </SettingsSectionForm>
                <form action={formAction} className="flex justify-end">
                    <Button
                        disabled={isSubmitting}
                        loading={isSubmitting}
                        type="submit"
                    >
                        {t("saveProxyProtocol")}
                    </Button>
                </form>
            </SettingsSectionBody>
        </SettingsSection>
    );
}
