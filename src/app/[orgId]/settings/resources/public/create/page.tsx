"use client";

import CopyTextBox from "@app/components/CopyTextBox";
import DomainPicker from "@app/components/DomainPicker";
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
import HeaderTitle from "@app/components/SettingsSectionTitle";
import {
    OptionSelect,
    type OptionSelectOption
} from "@app/components/OptionSelect";
import {
    StrategySelect,
    type StrategyOption
} from "@app/components/StrategySelect";
import { BrowserGatewayTargetForm } from "@app/components/BrowserGatewayTargetForm";
import {
    SitesSelector,
    type Selectedsite
} from "@app/components/site-selector";
import { Button } from "@app/components/ui/button";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@app/components/ui/form";
import { Input } from "@app/components/ui/input";
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@app/components/ui/popover";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { usePaidStatus } from "@app/hooks/usePaidStatus";
import { toast } from "@app/hooks/useToast";
import { PaidFeaturesAlert } from "@app/components/PaidFeaturesAlert";
import { tierMatrix, TierFeature } from "@server/lib/billing/tierMatrix";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { DockerManager, DockerState } from "@app/lib/docker";
import { orgQueries } from "@app/lib/queries";
import { finalizeSubdomainSanitize } from "@app/lib/subdomain-utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { build } from "@server/build";
import { Resource } from "@server/db";
import { isTargetValid } from "@server/lib/validators";
import { ListRemoteExitNodesResponse } from "@server/routers/remoteExitNode/types";
import { useQuery } from "@tanstack/react-query";
import {
    LocalTarget,
    ProxyResourceTargetsForm
} from "@app/app/[orgId]/settings/resources/public/ProxyResourceTargetsForm";
import { AxiosResponse } from "axios";
import {
    ChevronsUpDown,
    ExternalLink,
    SquareArrowOutUpRight
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toASCII } from "punycode";
import {
    useMemo,
    useState,
    useTransition,
    useEffect
} from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const baseResourceFormSchema = z.object({
    name: z.string().min(1).max(255),
    http: z.boolean()
});

const httpResourceFormSchema = z.object({
    domainId: z.string().nonempty(),
    subdomain: z.string().optional()
});

const tcpUdpResourceFormSchema = z.object({
    protocol: z.string(),
    proxyPort: z.int().min(1).max(65535)
});

const sshDaemonPortSchema = z.object({
    authDaemonPort: z.string().refine(
        (val) => {
            if (!val) return true;
            const n = Number(val);
            return Number.isInteger(n) && n >= 1 && n <= 65535;
        },
        { message: "Port must be between 1 and 65535" }
    )
});

const addTargetSchema = z
    .object({
        ip: z.string().refine(isTargetValid),
        method: z.string().nullable(),
        port: z.coerce.number<number>().int().positive(),
        siteId: z.int().positive(),
        path: z.string().optional().nullable(),
        pathMatchType: z
            .enum(["exact", "prefix", "regex"])
            .optional()
            .nullable(),
        rewritePath: z.string().optional().nullable(),
        rewritePathType: z
            .enum(["exact", "prefix", "regex", "stripPrefix"])
            .optional()
            .nullable(),
        priority: z.int().min(1).max(1000).optional()
    })
    .refine(
        (data) => {
            if (data.path && !data.pathMatchType) {
                return false;
            }
            if (data.pathMatchType && !data.path) {
                return false;
            }
            if (data.path && data.pathMatchType) {
                switch (data.pathMatchType) {
                    case "exact":
                    case "prefix":
                        return data.path.startsWith("/");
                    case "regex":
                        try {
                            new RegExp(data.path);
                            return true;
                        } catch {
                            return false;
                        }
                }
            }
            return true;
        },
        {
            error: "Invalid path configuration"
        }
    )
    .refine(
        (data) => {
            if (data.rewritePath && !data.rewritePathType) {
                return false;
            }
            if (data.rewritePathType && !data.rewritePath) {
                if (data.rewritePathType !== "stripPrefix") {
                    return false;
                }
            }
            return true;
        },
        {
            error: "Invalid rewrite path configuration"
        }
    );

type NewResourceType = "http" | "ssh" | "rdp" | "vnc" | "tcp" | "udp";

export default function Page() {
    const { env } = useEnvContext();
    const api = createApiClient({ env });
    const { orgId } = useParams();
    const router = useRouter();
    const t = useTranslations();

    const { data: sites = [], isLoading: loadingPage } = useQuery(
        orgQueries.sites({ orgId: orgId as string })
    );

    const { isPaidUser } = usePaidStatus();

    const [remoteExitNodes, setRemoteExitNodes] = useState<
        ListRemoteExitNodesResponse["remoteExitNodes"]
    >([]);
    const [loadingExitNodes, setLoadingExitNodes] = useState(build === "saas");

    const [createLoading, startTransition] = useTransition();
    const [showSnippets, setShowSnippets] = useState(false);
    const [niceId, setNiceId] = useState<string>("");

    // Resource type state
    const [resourceType, setResourceType] = useState<NewResourceType>("http");

    const isBrowserGatewayType =
        resourceType === "ssh" ||
        resourceType === "rdp" ||
        resourceType === "vnc";
    const browserGatewayDisabled =
        isBrowserGatewayType &&
        !isPaidUser(tierMatrix[TierFeature.AdvancedPublicResources]);

    // Target management state (managed by ProxyResourceTargetsForm; mirrored here for onSubmit)
    const [targets, setTargets] = useState<LocalTarget[]>([]);

    // SSH-specific state
    const [sshServerMode, setSshServerMode] = useState<"standard" | "native">(
        "native"
    );
    const [pamMode, setPamMode] = useState<"passthrough" | "push">(
        "passthrough"
    );
    const [standardDaemonLocation, setStandardDaemonLocation] = useState<
        "site" | "remote"
    >("site");
    const [nativeSelectedSite, setNativeSelectedSite] =
        useState<Selectedsite | null>(null);
    const [nativeSiteOpen, setNativeSiteOpen] = useState(false);

    // Browser-gateway targets state (SSH standard, RDP, VNC)
    const [bgSelectedSites, setBgSelectedSites] = useState<Selectedsite[]>([]);
    const [bgSelectedSite, setBgSelectedSite] = useState<Selectedsite | null>(
        null
    );
    const [bgDestination, setBgDestination] = useState("");
    const [bgDestinationPort, setBgDestinationPort] = useState("22");

    // Reset BG state when resource type changes
    useEffect(() => {
        if (resourceType === "rdp") {
            setBgDestinationPort("3389");
        } else if (resourceType === "vnc") {
            setBgDestinationPort("5900");
        } else if (resourceType === "ssh") {
            setBgDestinationPort("22");
        }
        setBgDestination("");
        setBgSelectedSites([]);
        setBgSelectedSite(null);
        setNativeSelectedSite(null);
    }, [resourceType]);

    useEffect(() => {
        if (build !== "saas") return;

        const fetchExitNodes = async () => {
            try {
                const res = await api.get<
                    AxiosResponse<ListRemoteExitNodesResponse>
                >(`/org/${orgId}/remote-exit-nodes`);
                if (res && res.status === 200) {
                    setRemoteExitNodes(res.data.data.remoteExitNodes);
                }
            } catch (e) {
                console.error("Failed to fetch remote exit nodes:", e);
            } finally {
                setLoadingExitNodes(false);
            }
        };

        fetchExitNodes();
    }, [orgId]);

    // Derived flags
    const isHttpResource = resourceType !== "tcp" && resourceType !== "udp";
    const isNative = sshServerMode === "native";
    const showDaemonLocation =
        resourceType === "ssh" && !isNative && pamMode === "push";
    const showDaemonPort =
        resourceType === "ssh" &&
        !isNative &&
        pamMode === "push" &&
        standardDaemonLocation === "remote";

    // Whether raw (TCP/UDP) resources are available
    const rawResourcesAllowed =
        env.flags.allowRawResources &&
        (build !== "saas" || remoteExitNodes.length > 0);
    const enterpriseModesAllowed =
        !env.flags.disableEnterpriseFeatures;

    const availableTypes = useMemo((): NewResourceType[] => {
        const base: NewResourceType[] = ["http"];
        if (enterpriseModesAllowed) {
            base.push("ssh", "rdp", "vnc");
        }
        if (rawResourcesAllowed) {
            base.push("tcp", "udp");
        }
        return base;
    }, [enterpriseModesAllowed, rawResourcesAllowed]);

    useEffect(() => {
        if (!availableTypes.includes(resourceType)) {
            setResourceType("http");
        }
    }, [availableTypes, resourceType]);

    const baseForm = useForm({
        resolver: zodResolver(baseResourceFormSchema),
        defaultValues: {
            name: "",
            http: true
        }
    });

    const httpForm = useForm({
        resolver: zodResolver(httpResourceFormSchema),
        defaultValues: {}
    });

    const tcpUdpForm = useForm({
        resolver: zodResolver(tcpUdpResourceFormSchema),
        defaultValues: {
            protocol: "tcp",
            proxyPort: undefined
        }
    });

    const sshDaemonPortForm = useForm({
        resolver: zodResolver(sshDaemonPortSchema),
        defaultValues: {
            authDaemonPort: "22123"
        }
    });

    // Sync form http field with resourceType
    useEffect(() => {
        baseForm.setValue("http", isHttpResource);
        if (resourceType === "tcp") {
            tcpUdpForm.setValue("protocol", "tcp");
        } else if (resourceType === "udp") {
            tcpUdpForm.setValue("protocol", "udp");
        }
    }, [resourceType, isHttpResource]);

    const areAllTargetsValid = () => {
        if (targets.length === 0) return true;

        return targets.every((target) => {
            try {
                const isHttp = resourceType === "http";
                const targetData: any = {
                    ip: target.ip,
                    method: target.method,
                    port: target.port,
                    siteId: target.siteId,
                    path: target.path,
                    pathMatchType: target.pathMatchType,
                    rewritePath: target.rewritePath,
                    rewritePathType: target.rewritePathType
                };

                if (isHttp) {
                    targetData.priority = target.priority;
                }

                addTargetSchema.parse(targetData);
                return true;
            } catch {
                return false;
            }
        });
    };

    async function onSubmit() {
        const baseData = baseForm.getValues();

        try {
            const payload: any = {
                name: baseData.name,
                http: isHttpResource
            };

            let sanitizedSubdomain: string | undefined;

            if (isHttpResource) {
                const httpData = httpForm.getValues();

                sanitizedSubdomain = httpData.subdomain
                    ? finalizeSubdomainSanitize(httpData.subdomain, true)
                    : undefined;

                const effectiveMode = isNative
                    ? "native"
                    : standardDaemonLocation;
                const portVal = sshDaemonPortForm.getValues().authDaemonPort;
                const effectivePort =
                    !isNative &&
                    standardDaemonLocation === "remote" &&
                    pamMode === "push" &&
                    portVal
                        ? Number(portVal)
                        : undefined;

                Object.assign(payload, {
                    subdomain: sanitizedSubdomain
                        ? toASCII(sanitizedSubdomain)
                        : undefined,
                    domainId: httpData.domainId,
                    protocol: "tcp",
                    mode: resourceType,
                    pamMode,
                    authDaemonMode: effectiveMode,
                    authDaemonPort: effectivePort || undefined
                });
            } else {
                const tcpUdpData = tcpUdpForm.getValues();
                Object.assign(payload, {
                    protocol: tcpUdpData.protocol,
                    proxyPort: tcpUdpData.proxyPort
                });
            }

            const res = await api
                .put<
                    AxiosResponse<Resource>
                >(`/org/${orgId}/resource/`, payload)
                .catch((e) => {
                    toast({
                        variant: "destructive",
                        title: t("resourceErrorCreate"),
                        description: formatAxiosError(
                            e,
                            t("resourceErrorCreateDescription")
                        )
                    });
                });

            if (res && res.status === 201) {
                const id = res.data.data.resourceId;
                const newNiceId = res.data.data.niceId;
                setNiceId(newNiceId);

                if (resourceType === "http") {
                    if (targets.length > 0) {
                        try {
                            for (const target of targets) {
                                const data: any = {
                                    ip: target.ip,
                                    port: target.port,
                                    method: target.method,
                                    enabled: target.enabled,
                                    siteId: target.siteId,
                                    hcEnabled: target.hcEnabled,
                                    hcPath: target.hcPath || null,
                                    hcMethod: target.hcMethod || null,
                                    hcInterval: target.hcInterval || null,
                                    hcTimeout: target.hcTimeout || null,
                                    hcHeaders: target.hcHeaders || null,
                                    hcScheme: target.hcScheme || null,
                                    hcHostname: target.hcHostname || null,
                                    hcPort: target.hcPort || null,
                                    hcFollowRedirects:
                                        target.hcFollowRedirects || null,
                                    hcStatus: target.hcStatus || null,
                                    hcUnhealthyInterval:
                                        target.hcUnhealthyInterval || null,
                                    hcMode: target.hcMode || null,
                                    hcTlsServerName: target.hcTlsServerName,
                                    hcHealthyThreshold:
                                        target.hcHealthyThreshold || null,
                                    hcUnhealthyThreshold:
                                        target.hcUnhealthyThreshold || null,
                                    path: target.path,
                                    pathMatchType: target.pathMatchType,
                                    rewritePath: target.rewritePath,
                                    rewritePathType: target.rewritePathType,
                                    priority: target.priority
                                };
                                await api.put(`/resource/${id}/target`, data);
                            }
                        } catch (targetError) {
                            console.error(
                                "Error creating targets:",
                                targetError
                            );
                            toast({
                                variant: "destructive",
                                title: t("targetErrorCreate"),
                                description: formatAxiosError(
                                    targetError,
                                    t("targetErrorCreateDescription")
                                )
                            });
                        }
                    }
                    router.push(
                        `/${orgId}/settings/resources/public/${newNiceId}`
                    );
                } else if (resourceType === "ssh") {
                    if (isNative) {
                        if (nativeSelectedSite) {
                            await api.put(
                                `/org/${orgId}/resource/${id}/browser-gateway-target`,
                                {
                                    siteId: nativeSelectedSite.siteId,
                                    type: "ssh",
                                    destination: "localhost",
                                    destinationPort: 22
                                }
                            );
                        }
                    } else {
                        const sitesToCreate =
                            standardDaemonLocation !== "site"
                                ? bgSelectedSites
                                : bgSelectedSite
                                  ? [bgSelectedSite]
                                  : [];
                        for (const site of sitesToCreate) {
                            await api.put(
                                `/org/${orgId}/resource/${id}/browser-gateway-target`,
                                {
                                    siteId: site.siteId,
                                    type: "ssh",
                                    destination: bgDestination,
                                    destinationPort: Number(bgDestinationPort)
                                }
                            );
                        }
                    }

                    router.push(
                        `/${orgId}/settings/resources/public/${newNiceId}`
                    );
                } else if (resourceType === "rdp" || resourceType === "vnc") {
                    for (const site of bgSelectedSites) {
                        await api.put(
                            `/org/${orgId}/resource/${id}/browser-gateway-target`,
                            {
                                siteId: site.siteId,
                                type: resourceType,
                                destination: bgDestination,
                                destinationPort: Number(bgDestinationPort)
                            }
                        );
                    }

                    router.push(
                        `/${orgId}/settings/resources/public/${newNiceId}`
                    );
                } else {
                    // TCP / UDP — create targets then show snippets
                    if (targets.length > 0) {
                        try {
                            for (const target of targets) {
                                const data: any = {
                                    ip: target.ip,
                                    port: target.port,
                                    method: target.method,
                                    enabled: target.enabled,
                                    siteId: target.siteId,
                                    hcEnabled: target.hcEnabled,
                                    hcPath: target.hcPath || null,
                                    hcMethod: target.hcMethod || null,
                                    hcInterval: target.hcInterval || null,
                                    hcTimeout: target.hcTimeout || null,
                                    hcHeaders: target.hcHeaders || null,
                                    hcScheme: target.hcScheme || null,
                                    hcHostname: target.hcHostname || null,
                                    hcPort: target.hcPort || null,
                                    hcFollowRedirects:
                                        target.hcFollowRedirects || null,
                                    hcStatus: target.hcStatus || null,
                                    hcUnhealthyInterval:
                                        target.hcUnhealthyInterval || null,
                                    hcMode: target.hcMode || null,
                                    hcTlsServerName: target.hcTlsServerName,
                                    hcHealthyThreshold:
                                        target.hcHealthyThreshold || null,
                                    hcUnhealthyThreshold:
                                        target.hcUnhealthyThreshold || null
                                };
                                await api.put(`/resource/${id}/target`, data);
                            }
                        } catch (targetError) {
                            console.error(
                                "Error creating targets:",
                                targetError
                            );
                            toast({
                                variant: "destructive",
                                title: t("targetErrorCreate"),
                                description: formatAxiosError(
                                    targetError,
                                    t("targetErrorCreateDescription")
                                )
                            });
                        }
                    }
                    setShowSnippets(true);
                    router.refresh();
                }
            }
        } catch (e) {
            console.error(t("resourceErrorCreateMessage"), e);
            toast({
                variant: "destructive",
                title: t("resourceErrorCreate"),
                description: formatAxiosError(
                    e,
                    t("resourceErrorCreateMessageDescription")
                )
            });
        }
    }

    // SSH strategy options
    const sshModeOptions: StrategyOption<"standard" | "native">[] = [
        {
            id: "native",
            title: t("sshServerModePangolin"),
            description: t("sshServerModeNativeDescription")
        },
        {
            id: "standard",
            title: t("sshServerModeStandard"),
            description: t("sshServerModeStandardDescription")
        }
    ];

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

    let typeLabels: Partial<Record<NewResourceType, string>> = {
        http: "HTTP",
        tcp: "TCP",
        udp: "UDP"
    };

    if (enterpriseModesAllowed) {
        typeLabels = {  
            ...typeLabels,
            ssh: "SSH",
            rdp: "RDP",
            vnc: "VNC",
        }
    }

    const typeOptions: OptionSelectOption<NewResourceType>[] =
        availableTypes.map((type) => ({
            value: type,
            label: typeLabels[type] ?? type.toUpperCase()
        }));

    return (
        <>
            <div className="flex justify-between">
                <HeaderTitle
                    title={t("resourceCreate")}
                    description={t("resourceCreateDescription")}
                />
                <Button
                    variant="outline"
                    onClick={() => {
                        router.push(`/${orgId}/settings/resources`);
                    }}
                >
                    {t("resourceSeeAll")}
                </Button>
            </div>

            {!loadingPage && (
                <div>
                    {!showSnippets ? (
                        <SettingsContainer>
                            {/* General Section */}
                            <SettingsSection>
                                <SettingsSectionHeader>
                                    <SettingsSectionTitle>
                                        {t("resourceCreateGeneral")}
                                    </SettingsSectionTitle>
                                    <SettingsSectionDescription>
                                        {t("resourceCreateGeneralDescription")}
                                    </SettingsSectionDescription>
                                </SettingsSectionHeader>
                                <SettingsSectionBody>
                                    <SettingsSectionForm variant="half">
                                        {/* Name */}
                                        <Form {...baseForm}>
                                            <form
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") {
                                                        e.preventDefault();
                                                    }
                                                }}
                                                className="grid gap-4 grid-cols-1 md:grid-cols-2 items-start"
                                                id="base-resource-form"
                                            >
                                                <FormField
                                                    control={baseForm.control}
                                                    name="name"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>
                                                                {t("name")}
                                                            </FormLabel>
                                                            <FormControl>
                                                                <Input
                                                                    {...field}
                                                                />
                                                            </FormControl>
                                                            <FormMessage />
                                                            <FormDescription>
                                                                {t(
                                                                    "resourceNameDescription"
                                                                )}
                                                            </FormDescription>
                                                        </FormItem>
                                                    )}
                                                />
                                            </form>
                                        </Form>

                                        {/* Inline Type Selector */}
                                        <div className="space-y-2">
                                            <p className="text-sm font-medium">
                                                {t("type")}
                                            </p>
                                            <OptionSelect<NewResourceType>
                                                options={typeOptions}
                                                value={resourceType}
                                                onChange={setResourceType}
                                                cols={6}
                                            />
                                            <p className="text-sm text-muted-foreground">
                                                {t("resourceTypeDescription")}
                                            </p>
                                        </div>

                                        {/* Domain/Subdomain (HTTP-based types) */}
                                        {isHttpResource && (
                                            <div className="space-y-2">
                                                <DomainPicker
                                                    allowWildcard={true}
                                                    orgId={orgId as string}
                                                    warnOnProvidedDomain={
                                                        remoteExitNodes.length >=
                                                        1
                                                    }
                                                    onDomainChange={(res) => {
                                                        if (!res) return;
                                                        httpForm.setValue(
                                                            "subdomain",
                                                            res.subdomain
                                                        );
                                                        httpForm.setValue(
                                                            "domainId",
                                                            res.domainId
                                                        );
                                                    }}
                                                />
                                                <p className="text-sm text-muted-foreground">
                                                    {t(
                                                        "resourceDomainDescription"
                                                    )}
                                                </p>
                                            </div>
                                        )}

                                        {/* Proxy Port (TCP/UDP types) */}
                                        {!isHttpResource && (
                                            <Form {...tcpUdpForm}>
                                                <form
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter") {
                                                            e.preventDefault();
                                                        }
                                                    }}
                                                    className="grid gap-4 grid-cols-1 md:grid-cols-2 items-start"
                                                    id="tcp-udp-settings-form"
                                                >
                                                    <FormField
                                                        control={
                                                            tcpUdpForm.control
                                                        }
                                                        name="proxyPort"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>
                                                                    {t(
                                                                        "resourcePortNumber"
                                                                    )}
                                                                </FormLabel>
                                                                <FormControl>
                                                                    <Input
                                                                        type="number"
                                                                        value={
                                                                            field.value ??
                                                                            ""
                                                                        }
                                                                        onChange={(
                                                                            e
                                                                        ) =>
                                                                            field.onChange(
                                                                                e
                                                                                    .target
                                                                                    .value
                                                                                    ? parseInt(
                                                                                          e
                                                                                              .target
                                                                                              .value
                                                                                      )
                                                                                    : undefined
                                                                            )
                                                                        }
                                                                    />
                                                                </FormControl>
                                                                <FormMessage />
                                                                <FormDescription>
                                                                    {t(
                                                                        "resourcePortDescription"
                                                                    )}
                                                                </FormDescription>
                                                            </FormItem>
                                                        )}
                                                    />
                                                </form>
                                            </Form>
                                        )}
                                    </SettingsSectionForm>
                                </SettingsSectionBody>
                            </SettingsSection>

                            {/* SSH Server Section */}
                            {resourceType === "ssh" && (
                                <SettingsSection>
                                    <PaidFeaturesAlert
                                        tiers={
                                            tierMatrix[
                                                TierFeature
                                                    .AdvancedPublicResources
                                            ]
                                        }
                                    />
                                    <SettingsSectionHeader>
                                        <SettingsSectionTitle>
                                            {t("sshServer")}
                                        </SettingsSectionTitle>
                                        <SettingsSectionDescription>
                                            {t("sshServerDescription")}
                                        </SettingsSectionDescription>
                                    </SettingsSectionHeader>
                                    <fieldset
                                        disabled={browserGatewayDisabled}
                                        className={
                                            browserGatewayDisabled
                                                ? "opacity-50 pointer-events-none"
                                                : ""
                                        }
                                    >
                                    <SettingsSectionBody>
                                        <SettingsSectionForm variant="half">
                                            {/* Mode */}
                                            <div className="space-y-2">
                                                <SettingsSubsectionTitle>
                                                    {t("sshServerMode")}
                                                </SettingsSubsectionTitle>
                                                <StrategySelect<
                                                    "standard" | "native"
                                                >
                                                    value={sshServerMode}
                                                    options={sshModeOptions}
                                                    onChange={setSshServerMode}
                                                    cols={2}
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <SettingsSubsectionTitle>
                                                    {t(
                                                        "sshAuthenticationMethod"
                                                    )}
                                                </SettingsSubsectionTitle>
                                                <StrategySelect<
                                                    "passthrough" | "push"
                                                >
                                                    value={pamMode}
                                                    options={
                                                        authMethodOptions
                                                    }
                                                    onChange={setPamMode}
                                                    cols={2}
                                                />
                                            </div>

                                            {/* Daemon Location (standard + push) */}
                                            {showDaemonLocation && (
                                                <div className="space-y-2">
                                                    <SettingsSubsectionTitle>
                                                        {t(
                                                            "sshAuthDaemonLocation"
                                                        )}
                                                    </SettingsSubsectionTitle>
                                                    <StrategySelect<
                                                        "site" | "remote"
                                                    >
                                                        value={
                                                            standardDaemonLocation
                                                        }
                                                        options={
                                                            daemonLocationOptions
                                                        }
                                                        onChange={
                                                            setStandardDaemonLocation
                                                        }
                                                        cols={2}
                                                    />
                                                    <p className="text-sm text-muted-foreground">
                                                        {t(
                                                            "sshDaemonDisclaimer"
                                                        )}{" "}
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

                                            {/* Daemon Port (standard + push + remote) */}
                                            {showDaemonPort && (
                                                <Form {...sshDaemonPortForm}>
                                                    <div className="w-full md:w-1/2">
                                                        <FormField
                                                            control={
                                                                sshDaemonPortForm.control
                                                            }
                                                            name="authDaemonPort"
                                                            render={({
                                                                field
                                                            }) => (
                                                                <FormItem>
                                                                    <FormLabel>
                                                                        {t(
                                                                            "sshDaemonPort"
                                                                        )}
                                                                    </FormLabel>
                                                                    <FormControl>
                                                                        <Input
                                                                            type="number"
                                                                            min={
                                                                                1
                                                                            }
                                                                            max={
                                                                                65535
                                                                            }
                                                                            {...field}
                                                                        />
                                                                    </FormControl>
                                                                    <FormMessage />
                                                                </FormItem>
                                                            )}
                                                        />
                                                    </div>
                                                </Form>
                                            )}

                                            {/* Server Destination */}
                                            <div className="space-y-3">
                                                <SettingsSubsectionHeader>
                                                    <SettingsSubsectionTitle>
                                                        {t(
                                                            "sshServerDestination"
                                                        )}
                                                    </SettingsSubsectionTitle>
                                                    <SettingsSubsectionDescription>
                                                        {t(
                                                            "sshServerDestinationDescription"
                                                        )}
                                                    </SettingsSubsectionDescription>
                                                </SettingsSubsectionHeader>
                                                {isNative ? (
                                                    <Popover
                                                        open={nativeSiteOpen}
                                                        onOpenChange={
                                                            setNativeSiteOpen
                                                        }
                                                    >
                                                        <PopoverTrigger asChild>
                                                            <Button
                                                                variant="outline"
                                                                role="combobox"
                                                                className="w-full md:w-1/2 justify-between font-normal"
                                                            >
                                                                <span className="truncate">
                                                                    {nativeSelectedSite?.name ??
                                                                        t(
                                                                            "siteSelect"
                                                                        )}
                                                                </span>
                                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                            </Button>
                                                        </PopoverTrigger>
                                                        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                                                            <SitesSelector
                                                                orgId={
                                                                    orgId as string
                                                                }
                                                                selectedSite={
                                                                    nativeSelectedSite
                                                                }
                                                                onSelectSite={(
                                                                    site
                                                                ) => {
                                                                    setNativeSelectedSite(
                                                                        site
                                                                    );
                                                                    setNativeSiteOpen(
                                                                        false
                                                                    );
                                                                }}
                                                            />
                                                        </PopoverContent>
                                                    </Popover>
                                                ) : standardDaemonLocation !==
                                                      "site" ||
                                                  pamMode ===
                                                      "passthrough" ? (
                                                    <BrowserGatewayTargetForm
                                                        orgId={orgId as string}
                                                        multiSite={true}
                                                        selectedSites={
                                                            bgSelectedSites
                                                        }
                                                        onSitesChange={
                                                            setBgSelectedSites
                                                        }
                                                        destination={
                                                            bgDestination
                                                        }
                                                        destinationPort={
                                                            bgDestinationPort
                                                        }
                                                        onDestinationChange={
                                                            setBgDestination
                                                        }
                                                        onDestinationPortChange={
                                                            setBgDestinationPort
                                                        }
                                                        learnMoreHref="https://docs.pangolin.net/manage/resources/public/ssh"
                                                        defaultPort={22}
                                                    />
                                                ) : (
                                                    <BrowserGatewayTargetForm
                                                        orgId={orgId as string}
                                                        multiSite={false}
                                                        selectedSite={
                                                            bgSelectedSite
                                                        }
                                                        onSiteChange={
                                                            setBgSelectedSite
                                                        }
                                                        destination={
                                                            bgDestination
                                                        }
                                                        destinationPort={
                                                            bgDestinationPort
                                                        }
                                                        onDestinationChange={
                                                            setBgDestination
                                                        }
                                                        onDestinationPortChange={
                                                            setBgDestinationPort
                                                        }
                                                        learnMoreHref="https://docs.pangolin.net/manage/resources/public/ssh"
                                                        defaultPort={22}
                                                    />
                                                )}
                                            </div>
                                        </SettingsSectionForm>
                                    </SettingsSectionBody>
                                    </fieldset>
                                </SettingsSection>
                            )}

                            {/* RDP Server Section */}
                            {resourceType === "rdp" && (
                                <SettingsSection>
                                    <PaidFeaturesAlert
                                        tiers={
                                            tierMatrix[
                                                TierFeature
                                                    .AdvancedPublicResources
                                            ]
                                        }
                                    />
                                    <SettingsSectionHeader>
                                        <SettingsSectionTitle>
                                            {t("rdpServer")}
                                        </SettingsSectionTitle>
                                        <SettingsSectionDescription>
                                            {t("rdpServerDescription")}
                                        </SettingsSectionDescription>
                                    </SettingsSectionHeader>
                                    <fieldset
                                        disabled={browserGatewayDisabled}
                                        className={
                                            browserGatewayDisabled
                                                ? "opacity-50 pointer-events-none"
                                                : ""
                                        }
                                    >
                                    <SettingsSectionBody>
                                        <SettingsSectionForm variant="half">
                                            <BrowserGatewayTargetForm
                                                orgId={orgId as string}
                                                multiSite={true}
                                                selectedSites={bgSelectedSites}
                                                onSitesChange={
                                                    setBgSelectedSites
                                                }
                                                destination={bgDestination}
                                                destinationPort={
                                                    bgDestinationPort
                                                }
                                                onDestinationChange={
                                                    setBgDestination
                                                }
                                                onDestinationPortChange={
                                                    setBgDestinationPort
                                                }
                                                learnMoreHref="https://docs.pangolin.net/manage/resources/public/rdp"
                                                defaultPort={3389}
                                            />
                                        </SettingsSectionForm>
                                    </SettingsSectionBody>
                                    </fieldset>
                                </SettingsSection>
                            )}

                            {/* VNC Server Section */}
                            {resourceType === "vnc" && (
                                <SettingsSection>
                                    <PaidFeaturesAlert
                                        tiers={
                                            tierMatrix[
                                                TierFeature
                                                    .AdvancedPublicResources
                                            ]
                                        }
                                    />
                                    <SettingsSectionHeader>
                                        <SettingsSectionTitle>
                                            {t("vncServer")}
                                        </SettingsSectionTitle>
                                        <SettingsSectionDescription>
                                            {t("vncServerDescription")}
                                        </SettingsSectionDescription>
                                    </SettingsSectionHeader>
                                    <fieldset
                                        disabled={browserGatewayDisabled}
                                        className={
                                            browserGatewayDisabled
                                                ? "opacity-50 pointer-events-none"
                                                : ""
                                        }
                                    >
                                    <SettingsSectionBody>
                                        <SettingsSectionForm variant="half">
                                            <BrowserGatewayTargetForm
                                                orgId={orgId as string}
                                                multiSite={true}
                                                selectedSites={bgSelectedSites}
                                                onSitesChange={
                                                    setBgSelectedSites
                                                }
                                                destination={bgDestination}
                                                destinationPort={
                                                    bgDestinationPort
                                                }
                                                onDestinationChange={
                                                    setBgDestination
                                                }
                                                onDestinationPortChange={
                                                    setBgDestinationPort
                                                }
                                                learnMoreHref="https://docs.pangolin.net/manage/resources/public/vnc"
                                                defaultPort={5900}
                                            />
                                        </SettingsSectionForm>
                                    </SettingsSectionBody>
                                    </fieldset>
                                </SettingsSection>
                            )}

                            {/* Targets Section (HTTP / TCP / UDP) */}
                            {(resourceType === "http" ||
                                resourceType === "tcp" ||
                                resourceType === "udp") && (
                                <ProxyResourceTargetsForm
                                    orgId={orgId!.toString()}
                                    isHttp={resourceType === "http"}
                                    onChange={setTargets}
                                />
                            )}

                            <div className="flex justify-end space-x-2 mt-8">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() =>
                                        router.push(
                                            `/${orgId}/settings/resources`
                                        )
                                    }
                                >
                                    {t("cancel")}
                                </Button>
                                <Button
                                    type="button"
                                    onClick={async () => {
                                        const baseValid =
                                            await baseForm.trigger();
                                        const domainValid = isHttpResource
                                            ? await httpForm.trigger()
                                            : true;
                                        const tcpValid = !isHttpResource
                                            ? await tcpUdpForm.trigger()
                                            : true;
                                        const sshPortValid = showDaemonPort
                                            ? await sshDaemonPortForm.trigger()
                                            : true;

                                        if (
                                            baseValid &&
                                            domainValid &&
                                            tcpValid &&
                                            sshPortValid
                                        ) {
                                            onSubmit();
                                        }
                                    }}
                                    loading={createLoading}
                                    disabled={!areAllTargetsValid() || browserGatewayDisabled}
                                >
                                    {t("resourceCreate")}
                                </Button>
                            </div>
                        </SettingsContainer>
                    ) : (
                        <SettingsContainer>
                            <SettingsSection>
                                <SettingsSectionHeader>
                                    <SettingsSectionTitle>
                                        {t("resourceConfig")}
                                    </SettingsSectionTitle>
                                    <SettingsSectionDescription>
                                        {t("resourceConfigDescription")}
                                    </SettingsSectionDescription>
                                </SettingsSectionHeader>
                                <SettingsSectionBody>
                                    <div className="space-y-6">
                                        <div className="space-y-4">
                                            <h3 className="text-lg font-semibold">
                                                {t("resourceAddEntrypoints")}
                                            </h3>
                                            <p className="text-sm text-muted-foreground">
                                                {t(
                                                    "resourceAddEntrypointsEditFile"
                                                )}
                                            </p>
                                            <CopyTextBox
                                                text={`entryPoints:
  ${tcpUdpForm.getValues("protocol")}-${tcpUdpForm.getValues("proxyPort")}:
    address: ":${tcpUdpForm.getValues("proxyPort")}/${tcpUdpForm.getValues("protocol")}"`}
                                                wrapText={false}
                                            />
                                        </div>

                                        <div className="space-y-4">
                                            <h3 className="text-lg font-semibold">
                                                {t("resourceExposePorts")}
                                            </h3>
                                            <p className="text-sm text-muted-foreground">
                                                {t(
                                                    "resourceExposePortsEditFile"
                                                )}
                                            </p>
                                            <CopyTextBox
                                                text={`ports:
  - ${tcpUdpForm.getValues("proxyPort")}:${tcpUdpForm.getValues("proxyPort")}${tcpUdpForm.getValues("protocol") === "tcp" ? "" : "/" + tcpUdpForm.getValues("protocol")}`}
                                                wrapText={false}
                                            />
                                        </div>

                                        <Link
                                            className="text-sm text-primary flex items-center gap-1"
                                            href="https://docs.pangolin.net/manage/resources/public/raw-resources"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            <span>{t("resourceLearnRaw")}</span>
                                            <SquareArrowOutUpRight size={14} />
                                        </Link>
                                    </div>
                                </SettingsSectionBody>
                            </SettingsSection>

                            <div className="flex justify-end space-x-2 mt-8">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() =>
                                        router.push(
                                            `/${orgId}/settings/resources`
                                        )
                                    }
                                >
                                    {t("resourceBack")}
                                </Button>
                                <Button
                                    type="button"
                                    onClick={() =>
                                        router.push(
                                            `/${orgId}/settings/resources/public/${niceId}`
                                        )
                                    }
                                >
                                    {t("resourceGoTo")}
                                </Button>
                            </div>
                        </SettingsContainer>
                    )}
                </div>
            )}
        </>
    );
}
