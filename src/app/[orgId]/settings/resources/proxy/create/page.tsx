"use client";

import CopyTextBox from "@app/components/CopyTextBox";
import DomainPicker from "@app/components/DomainPicker";
import HealthCheckCredenza from "@app/components/HealthCheckCredenza";
import {
    PathMatchDisplay,
    PathMatchModal,
    PathRewriteDisplay,
    PathRewriteModal
} from "@app/components/PathMatchRenameModal";
import {
    SettingsContainer,
    SettingsSection,
    SettingsSectionBody,
    SettingsSectionDescription,
    SettingsSectionForm,
    SettingsSectionHeader,
    SettingsSectionTitle
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
import { ResourceTargetAddressItem } from "@app/components/resource-target-address-item";
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@app/components/ui/select";
import { Switch } from "@app/components/ui/switch";
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
import { Alert, AlertDescription, AlertTitle } from "@app/components/ui/alert";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { toast } from "@app/hooks/useToast";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { DockerManager, DockerState } from "@app/lib/docker";
import { orgQueries } from "@app/lib/queries";
import { finalizeSubdomainSanitize } from "@app/lib/subdomain-utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { build } from "@server/build";
import { Resource } from "@server/db";
import { isTargetValid } from "@server/lib/validators";
import { ListTargetsResponse } from "@server/routers/target";
import { ListRemoteExitNodesResponse } from "@server/routers/remoteExitNode/types";
import { ArrayElement } from "@server/types/ArrayElement";
import { useQuery } from "@tanstack/react-query";
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
    ChevronsUpDown,
    CircleCheck,
    CircleX,
    ExternalLink,
    Info,
    Plus,
    Settings,
    SquareArrowOutUpRight
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toASCII } from "punycode";
import { useEffect, useMemo, useState, useCallback } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { cn } from "@app/lib/cn";

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

export type LocalTarget = Omit<
    ArrayElement<ListTargetsResponse["targets"]> & {
        new?: boolean;
        updated?: boolean;
        siteType: string | null;
    },
    "protocol"
>;

export default function Page() {
    const { env } = useEnvContext();
    const api = createApiClient({ env });
    const { orgId } = useParams();
    const router = useRouter();
    const t = useTranslations();

    const { data: sites = [], isLoading: loadingPage } = useQuery(
        orgQueries.sites({ orgId: orgId as string })
    );

    const [remoteExitNodes, setRemoteExitNodes] = useState<
        ListRemoteExitNodesResponse["remoteExitNodes"]
    >([]);
    const [loadingExitNodes, setLoadingExitNodes] = useState(build === "saas");

    const [createLoading, setCreateLoading] = useState(false);
    const [showSnippets, setShowSnippets] = useState(false);
    const [niceId, setNiceId] = useState<string>("");

    // Resource type state
    const [resourceType, setResourceType] = useState<NewResourceType>("http");

    // Target management state
    const [targets, setTargets] = useState<LocalTarget[]>([]);
    const [dockerStates, setDockerStates] = useState<Map<number, DockerState>>(
        new Map()
    );

    const [selectedTargetForHealthCheck, setSelectedTargetForHealthCheck] =
        useState<LocalTarget | null>(null);
    const [healthCheckDialogOpen, setHealthCheckDialogOpen] = useState(false);

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

    const [isAdvancedMode, setIsAdvancedMode] = useState(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem("create-advanced-mode");
            return saved === "true";
        }
        return false;
    });

    useEffect(() => {
        if (typeof window !== "undefined") {
            localStorage.setItem(
                "create-advanced-mode",
                isAdvancedMode.toString()
            );
        }
    }, [isAdvancedMode]);

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

    function addNewTarget() {
        const isHttp = resourceType === "http";

        const newTarget: LocalTarget = {
            targetId: -Date.now(),
            ip: "",
            method: isHttp ? "http" : null,
            port: 0,
            siteId: sites.length > 0 ? sites[0].siteId : 0,
            siteName: sites.length > 0 ? sites[0].name : "",
            path: null,
            pathMatchType: null,
            rewritePath: null,
            rewritePathType: null,
            priority: isHttp ? 100 : 100,
            enabled: true,
            resourceId: 0,
            hcEnabled: false,
            hcPath: null,
            hcMethod: null,
            hcInterval: null,
            hcTimeout: null,
            hcHeaders: null,
            hcScheme: null,
            hcHostname: null,
            hcPort: null,
            hcFollowRedirects: null,
            hcHealth: "unknown",
            hcStatus: null,
            hcMode: null,
            hcUnhealthyInterval: null,
            hcTlsServerName: null,
            hcHealthyThreshold: null,
            hcUnhealthyThreshold: null,
            siteType: sites.length > 0 ? sites[0].type : null,
            new: true,
            updated: false
        };

        setTargets((prev) => [...prev, newTarget]);
    }

    // Whether raw (TCP/UDP) resources are available
    const rawResourcesAllowed =
        env.flags.allowRawResources &&
        (build !== "saas" || remoteExitNodes.length > 0);

    const availableTypes = useMemo((): NewResourceType[] => {
        const base: NewResourceType[] = ["http", "ssh", "rdp", "vnc"];
        if (rawResourcesAllowed) {
            base.push("tcp", "udp");
        }
        return base;
    }, [rawResourcesAllowed]);

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

    const addTargetForm = useForm({
        resolver: zodResolver(addTargetSchema),
        defaultValues: {
            ip: "",
            method: "http",
            port: "" as any as number,
            path: null,
            pathMatchType: null,
            rewritePath: null,
            rewritePathType: null,
            priority: 100
        } as z.infer<typeof addTargetSchema>
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

    const initializeDockerForSite = async (siteId: number) => {
        if (dockerStates.has(siteId)) {
            return;
        }

        const dockerManager = new DockerManager(api, siteId);
        const dockerState = await dockerManager.initializeDocker();

        setDockerStates((prev) => new Map(prev.set(siteId, dockerState)));
    };

    const refreshContainersForSite = useCallback(
        async (siteId: number) => {
            const dockerManager = new DockerManager(api, siteId);
            const containers = await dockerManager.fetchContainers();

            setDockerStates((prev) => {
                const newMap = new Map(prev);
                const existingState = newMap.get(siteId);
                if (existingState) {
                    newMap.set(siteId, { ...existingState, containers });
                }
                return newMap;
            });
        },
        [api]
    );

    const getDockerStateForSite = useCallback(
        (siteId: number): DockerState => {
            return (
                dockerStates.get(siteId) || {
                    isEnabled: false,
                    isAvailable: false,
                    containers: []
                }
            );
        },
        [dockerStates]
    );

    const removeTarget = useCallback((targetId: number) => {
        setTargets((prevTargets) => {
            return prevTargets.filter((target) => target.targetId !== targetId);
        });
    }, []);

    const updateTarget = useCallback(
        (targetId: number, data: Partial<LocalTarget>) => {
            setTargets((prevTargets) => {
                const site = sites.find((site) => site.siteId === data.siteId);
                return prevTargets.map((target) =>
                    target.targetId === targetId
                        ? {
                              ...target,
                              ...data,
                              updated: true,
                              siteType: site ? site.type : target.siteType
                          }
                        : target
                );
            });
        },
        [sites]
    );

    async function onSubmit() {
        setCreateLoading(true);

        const baseData = baseForm.getValues();

        try {
            const payload: any = {
                name: baseData.name,
                http: isHttpResource,
                browserAccessType: resourceType
            };

            let sanitizedSubdomain: string | undefined;

            if (isHttpResource) {
                const httpData = httpForm.getValues();

                sanitizedSubdomain = httpData.subdomain
                    ? finalizeSubdomainSanitize(httpData.subdomain, true)
                    : undefined;

                Object.assign(payload, {
                    subdomain: sanitizedSubdomain
                        ? toASCII(sanitizedSubdomain)
                        : undefined,
                    domainId: httpData.domainId,
                    protocol: "tcp"
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
                        `/${orgId}/settings/resources/proxy/${newNiceId}`
                    );
                } else if (resourceType === "ssh") {
                    const effectiveMode = isNative
                        ? "native"
                        : standardDaemonLocation;
                    const portVal =
                        sshDaemonPortForm.getValues().authDaemonPort;
                    const effectivePort =
                        !isNative &&
                        standardDaemonLocation === "remote" &&
                        pamMode === "push" &&
                        portVal
                            ? Number(portVal)
                            : null;

                    await api.post(`/resource/${id}`, {
                        pamMode,
                        authDaemonMode: effectiveMode,
                        authDaemonPort: effectivePort
                    });

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
                        `/${orgId}/settings/resources/proxy/${newNiceId}`
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
                        `/${orgId}/settings/resources/proxy/${newNiceId}`
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

        setCreateLoading(false);
    }

    useEffect(() => {
        for (const site of sites) {
            if (site.type === "newt") {
                initializeDockerForSite(site.siteId);
            }
        }

        if (sites.length > 0) {
            addTargetForm.setValue("siteId", sites[0].siteId);
        }
    }, [sites]);

    function TargetHealthCheck(targetId: number, config: any) {
        setTargets(
            targets.map((target) =>
                target.targetId === targetId
                    ? {
                          ...target,
                          ...config,
                          updated: true
                      }
                    : target
            )
        );
    }

    const openHealthCheckDialog = useCallback((target: LocalTarget) => {
        console.log(target);
        setSelectedTargetForHealthCheck(target);
        setHealthCheckDialogOpen(true);
    }, []);

    const isHttp = resourceType === "http";

    const columns = useMemo((): ColumnDef<LocalTarget>[] => {
        const priorityColumn: ColumnDef<LocalTarget> = {
            id: "priority",
            header: () => (
                <div className="flex items-center gap-2 p-3">
                    {t("priority")}
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p className="max-w-xs">
                                    {t("priorityDescription")}
                                </p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            ),
            cell: ({ row }) => {
                return (
                    <div className="p-3">
                        <Input
                            type="number"
                            defaultValue={row.original.priority ?? 100}
                            min={1}
                            max={1000}
                            className="w-20 h-7 text-sm"
                            onChange={(e) => {
                                const val = parseInt(e.target.value);
                                if (!isNaN(val) && val >= 1 && val <= 1000) {
                                    updateTarget(row.original.targetId, {
                                        priority: val
                                    });
                                }
                            }}
                        />
                    </div>
                );
            },
            size: 120,
            minSize: 100,
            maxSize: 150
        };

        const healthCheckColumn: ColumnDef<LocalTarget> = {
            accessorKey: "healthCheck",
            header: () => <span className="p-3">{t("healthCheck")}</span>,
            cell: ({ row }) => {
                const status = row.original.hcHealth || "unknown";

                const getStatusText = (status: string) => {
                    switch (status) {
                        case "healthy":
                            return t("healthy");
                        case "unhealthy":
                            return t("unhealthy");
                        default:
                            return t("unknown");
                    }
                };

                return (
                    <div className="flex items-center gap-2 p-3">
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => openHealthCheckDialog(row.original)}
                        >
                            <Settings className="h-3.5 w-3.5" />
                            {row.original.hcEnabled ? (
                                <>
                                    {status === "healthy" && (
                                        <CircleCheck className="h-3.5 w-3.5 text-green-500" />
                                    )}
                                    {status === "unhealthy" && (
                                        <CircleX className="h-3.5 w-3.5 text-red-500" />
                                    )}
                                    {status === "unknown" && (
                                        <Info className="h-3.5 w-3.5 text-yellow-500" />
                                    )}
                                    {getStatusText(status)}
                                </>
                            ) : (
                                t("configure")
                            )}
                        </Button>
                    </div>
                );
            },
            size: 200,
            minSize: 180,
            maxSize: 250
        };

        const matchPathColumn: ColumnDef<LocalTarget> = {
            accessorKey: "path",
            header: () => <span className="p-3">{t("matchPath")}</span>,
            cell: ({ row }) => {
                const hasPathMatch = !!(
                    row.original.path || row.original.pathMatchType
                );

                return (
                    <div className="p-3">
                        {hasPathMatch ? (
                            <PathMatchModal
                                value={{
                                    path: row.original.path,
                                    pathMatchType: row.original.pathMatchType
                                }}
                                onChange={(config) =>
                                    updateTarget(
                                        row.original.targetId,
                                        config.path === null &&
                                            config.pathMatchType === null
                                            ? {
                                                  ...config,
                                                  rewritePath: null,
                                                  rewritePathType: null
                                              }
                                            : config
                                    )
                                }
                                trigger={
                                    <Button
                                        variant="outline"
                                        className="flex items-center gap-2 p-2 w-full text-left cursor-pointer max-w-[200px]"
                                    >
                                        <PathMatchDisplay
                                            value={{
                                                path: row.original.path,
                                                pathMatchType:
                                                    row.original.pathMatchType
                                            }}
                                        />
                                    </Button>
                                }
                            />
                        ) : (
                            <PathMatchModal
                                value={{
                                    path: row.original.path,
                                    pathMatchType: row.original.pathMatchType
                                }}
                                onChange={(config) =>
                                    updateTarget(
                                        row.original.targetId,
                                        config.path === null &&
                                            config.pathMatchType === null
                                            ? {
                                                  ...config,
                                                  rewritePath: null,
                                                  rewritePathType: null
                                              }
                                            : config
                                    )
                                }
                                trigger={
                                    <Button
                                        variant="outline"
                                        className="w-full max-w-[200px]"
                                    >
                                        <Plus className="h-4 w-4 mr-2" />
                                        {t("matchPath")}
                                    </Button>
                                }
                            />
                        )}
                    </div>
                );
            },
            size: 200,
            minSize: 180,
            maxSize: 200
        };

        const addressColumn: ColumnDef<LocalTarget> = {
            accessorKey: "address",
            header: () => <span className="p-3">{t("address")}</span>,
            cell: ({ row }) => (
                <ResourceTargetAddressItem
                    isHttp={isHttp}
                    orgId={orgId!.toString()}
                    getDockerStateForSite={getDockerStateForSite}
                    proxyTarget={row.original}
                    refreshContainersForSite={refreshContainersForSite}
                    updateTarget={updateTarget}
                />
            ),
            size: 400,
            minSize: 350,
            maxSize: 500
        };

        const rewritePathColumn: ColumnDef<LocalTarget> = {
            accessorKey: "rewritePath",
            header: () => <span className="p-3">{t("rewritePath")}</span>,
            cell: ({ row }) => {
                const hasRewritePath = !!(
                    row.original.rewritePath || row.original.rewritePathType
                );
                const noPathMatch =
                    !row.original.path && !row.original.pathMatchType;

                return (
                    <div className="flex items-center justify-center w-full">
                        {hasRewritePath && !noPathMatch ? (
                            <PathRewriteModal
                                value={{
                                    rewritePath: row.original.rewritePath,
                                    rewritePathType:
                                        row.original.rewritePathType
                                }}
                                onChange={(config) =>
                                    updateTarget(row.original.targetId, config)
                                }
                                trigger={
                                    <Button
                                        variant="outline"
                                        className="flex items-center gap-2 p-2 w-full text-left cursor-pointer max-w-[200px]"
                                        disabled={noPathMatch}
                                    >
                                        <PathRewriteDisplay
                                            value={{
                                                rewritePath:
                                                    row.original.rewritePath,
                                                rewritePathType:
                                                    row.original.rewritePathType
                                            }}
                                        />
                                    </Button>
                                }
                            />
                        ) : (
                            <PathRewriteModal
                                value={{
                                    rewritePath: row.original.rewritePath,
                                    rewritePathType:
                                        row.original.rewritePathType
                                }}
                                onChange={(config) =>
                                    updateTarget(row.original.targetId, config)
                                }
                                trigger={
                                    <Button
                                        variant="outline"
                                        disabled={noPathMatch}
                                        className="w-full max-w-[200px]"
                                    >
                                        <Plus className="h-4 w-4 mr-2" />
                                        {t("rewritePath")}
                                    </Button>
                                }
                                disabled={noPathMatch}
                            />
                        )}
                    </div>
                );
            },
            size: 200,
            minSize: 180,
            maxSize: 200
        };

        const enabledColumn: ColumnDef<LocalTarget> = {
            accessorKey: "enabled",
            header: () => <span className="p-3">{t("enabled")}</span>,
            cell: ({ row }) => (
                <div className="flex items-center justify-center w-full">
                    <Switch
                        defaultChecked={row.original.enabled}
                        onCheckedChange={(val) =>
                            updateTarget(row.original.targetId, {
                                ...row.original,
                                enabled: val
                            })
                        }
                    />
                </div>
            ),
            size: 100,
            minSize: 80,
            maxSize: 120
        };

        const actionsColumn: ColumnDef<LocalTarget> = {
            id: "actions",
            header: () => <span className="p-3">{t("actions")}</span>,
            cell: ({ row }) => (
                <div className="flex items-center justify-end w-full">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeTarget(row.original.targetId)}
                    >
                        <CircleX className="h-4 w-4" />
                    </Button>
                </div>
            ),
            size: 100,
            minSize: 80,
            maxSize: 120
        };

        if (isAdvancedMode) {
            const cols = [
                addressColumn,
                healthCheckColumn,
                enabledColumn,
                actionsColumn
            ];

            if (isHttp) {
                cols.splice(
                    1,
                    0,
                    matchPathColumn,
                    rewritePathColumn,
                    priorityColumn
                );
            }

            return cols;
        } else {
            return [
                addressColumn,
                healthCheckColumn,
                enabledColumn,
                actionsColumn
            ];
        }
    }, [
        isAdvancedMode,
        isHttp,
        sites,
        updateTarget,
        getDockerStateForSite,
        refreshContainersForSite,
        openHealthCheckDialog,
        removeTarget,
        t
    ]);

    const table = useReactTable({
        data: targets,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getRowId: (row) => String(row.targetId),
        state: {
            pagination: {
                pageIndex: 0,
                pageSize: 1000
            }
        }
    });

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

    const typeLabels: Record<NewResourceType, string> = {
        http: "HTTP",
        ssh: "SSH",
        rdp: "RDP",
        vnc: "VNC",
        tcp: "TCP",
        udp: "UDP"
    };

    const typeOptions: OptionSelectOption<NewResourceType>[] =
        availableTypes.map((type) => ({
            value: type,
            label: typeLabels[type]
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
                                                className="space-y-4"
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
                                                    className="space-y-4"
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
                                    <SettingsSectionHeader>
                                        <SettingsSectionTitle>
                                            {t("sshServer")}
                                        </SettingsSectionTitle>
                                        <SettingsSectionDescription>
                                            {t("sshServerDescription")}
                                        </SettingsSectionDescription>
                                    </SettingsSectionHeader>
                                    <SettingsSectionBody>
                                        <SettingsSectionForm variant="half">
                                            {/* Mode */}
                                            <div className="space-y-3">
                                                <p className="text-sm font-semibold">
                                                    {t("sshServerMode")}
                                                </p>
                                                <StrategySelect<
                                                    "standard" | "native"
                                                >
                                                    value={sshServerMode}
                                                    options={sshModeOptions}
                                                    onChange={setSshServerMode}
                                                    cols={2}
                                                />
                                            </div>

                                            {/* Auth Method (standard only) */}
                                            {!isNative && (
                                                <div className="space-y-3">
                                                    <p className="text-sm font-semibold">
                                                        {t(
                                                            "sshAuthenticationMethod"
                                                        )}
                                                    </p>
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
                                            )}

                                            {/* Daemon Location (standard + push) */}
                                            {showDaemonLocation && (
                                                <div className="space-y-3">
                                                    <p className="text-sm font-semibold">
                                                        {t(
                                                            "sshAuthDaemonLocation"
                                                        )}
                                                    </p>
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
                                                    <FormField
                                                        control={
                                                            sshDaemonPortForm.control
                                                        }
                                                        name="authDaemonPort"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>
                                                                    {t(
                                                                        "sshDaemonPort"
                                                                    )}
                                                                </FormLabel>
                                                                <FormControl>
                                                                    <Input
                                                                        type="number"
                                                                        min={1}
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
                                                </Form>
                                            )}

                                            {/* Server Destination */}
                                            <div className="space-y-3">
                                                <div>
                                                    <h2 className="text-sm font-semibold">
                                                        {t(
                                                            "sshServerDestination"
                                                        )}
                                                    </h2>
                                                    <p className="text-sm text-muted-foreground">
                                                        {t(
                                                            "sshServerDestinationDescription"
                                                        )}
                                                    </p>
                                                </div>
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
                                                                className="w-full max-w-xs justify-between font-normal"
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
                                                  "site" ? (
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
                                </SettingsSection>
                            )}

                            {/* RDP Server Section */}
                            {resourceType === "rdp" && (
                                <SettingsSection>
                                    <SettingsSectionHeader>
                                        <SettingsSectionTitle>
                                            {t("rdpServer")}
                                        </SettingsSectionTitle>
                                        <SettingsSectionDescription>
                                            {t("rdpServerDescription")}
                                        </SettingsSectionDescription>
                                    </SettingsSectionHeader>
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
                                </SettingsSection>
                            )}

                            {/* VNC Server Section */}
                            {resourceType === "vnc" && (
                                <SettingsSection>
                                    <SettingsSectionHeader>
                                        <SettingsSectionTitle>
                                            {t("vncServer")}
                                        </SettingsSectionTitle>
                                        <SettingsSectionDescription>
                                            {t("vncServerDescription")}
                                        </SettingsSectionDescription>
                                    </SettingsSectionHeader>
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
                                </SettingsSection>
                            )}

                            {/* Targets Section (HTTP / TCP / UDP) */}
                            {(resourceType === "http" ||
                                resourceType === "tcp" ||
                                resourceType === "udp") && (
                                <SettingsSection>
                                    <SettingsSectionHeader>
                                        <SettingsSectionTitle>
                                            {t("targets")}
                                        </SettingsSectionTitle>
                                        <SettingsSectionDescription>
                                            {t("targetsDescription")}
                                        </SettingsSectionDescription>
                                    </SettingsSectionHeader>
                                    <SettingsSectionBody>
                                        {targets.length > 0 ? (
                                            <>
                                                <div className="overflow-x-auto">
                                                    <Table>
                                                        <TableHeader>
                                                            {table
                                                                .getHeaderGroups()
                                                                .map(
                                                                    (
                                                                        headerGroup
                                                                    ) => (
                                                                        <TableRow
                                                                            key={
                                                                                headerGroup.id
                                                                            }
                                                                        >
                                                                            {headerGroup.headers.map(
                                                                                (
                                                                                    header
                                                                                ) => {
                                                                                    const isActionsColumn =
                                                                                        header
                                                                                            .column
                                                                                            .id ===
                                                                                        "actions";
                                                                                    return (
                                                                                        <TableHead
                                                                                            key={
                                                                                                header.id
                                                                                            }
                                                                                            className={
                                                                                                isActionsColumn
                                                                                                    ? "sticky right-0 z-10 w-auto min-w-fit bg-card"
                                                                                                    : ""
                                                                                            }
                                                                                        >
                                                                                            {header.isPlaceholder
                                                                                                ? null
                                                                                                : flexRender(
                                                                                                      header
                                                                                                          .column
                                                                                                          .columnDef
                                                                                                          .header,
                                                                                                      header.getContext()
                                                                                                  )}
                                                                                        </TableHead>
                                                                                    );
                                                                                }
                                                                            )}
                                                                        </TableRow>
                                                                    )
                                                                )}
                                                        </TableHeader>
                                                        <TableBody>
                                                            {table.getRowModel()
                                                                .rows
                                                                ?.length ? (
                                                                table
                                                                    .getRowModel()
                                                                    .rows.map(
                                                                        (
                                                                            row
                                                                        ) => (
                                                                            <TableRow
                                                                                key={
                                                                                    row.id
                                                                                }
                                                                            >
                                                                                {row
                                                                                    .getVisibleCells()
                                                                                    .map(
                                                                                        (
                                                                                            cell
                                                                                        ) => {
                                                                                            const isActionsColumn =
                                                                                                cell
                                                                                                    .column
                                                                                                    .id ===
                                                                                                "actions";
                                                                                            return (
                                                                                                <TableCell
                                                                                                    key={
                                                                                                        cell.id
                                                                                                    }
                                                                                                    className={
                                                                                                        isActionsColumn
                                                                                                            ? "sticky right-0 z-10 w-auto min-w-fit bg-card"
                                                                                                            : ""
                                                                                                    }
                                                                                                >
                                                                                                    {flexRender(
                                                                                                        cell
                                                                                                            .column
                                                                                                            .columnDef
                                                                                                            .cell,
                                                                                                        cell.getContext()
                                                                                                    )}
                                                                                                </TableCell>
                                                                                            );
                                                                                        }
                                                                                    )}
                                                                            </TableRow>
                                                                        )
                                                                    )
                                                            ) : (
                                                                <TableRow>
                                                                    <TableCell
                                                                        colSpan={
                                                                            columns.length
                                                                        }
                                                                        className="h-24 text-center"
                                                                    >
                                                                        {t(
                                                                            "targetNoOne"
                                                                        )}
                                                                    </TableCell>
                                                                </TableRow>
                                                            )}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                                <div className="flex items-center justify-between mb-4">
                                                    <div className="flex items-center justify-between w-full gap-2">
                                                        <Button
                                                            onClick={
                                                                addNewTarget
                                                            }
                                                            variant="outline"
                                                        >
                                                            <Plus className="h-4 w-4 mr-2" />
                                                            {t("addTarget")}
                                                        </Button>
                                                        <div className="flex items-center gap-2">
                                                            <Switch
                                                                id="advanced-mode-toggle"
                                                                checked={
                                                                    isAdvancedMode
                                                                }
                                                                onCheckedChange={
                                                                    setIsAdvancedMode
                                                                }
                                                            />
                                                            <label
                                                                htmlFor="advanced-mode-toggle"
                                                                className="text-sm"
                                                            >
                                                                {t(
                                                                    "advancedMode"
                                                                )}
                                                            </label>
                                                        </div>
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="text-center py-8 border-2 border-dashed border-muted rounded-lg p-4">
                                                <p className="text-muted-foreground mb-4">
                                                    {t("targetNoOne")}
                                                </p>
                                                <Button
                                                    onClick={addNewTarget}
                                                    variant="outline"
                                                >
                                                    <Plus className="h-4 w-4 mr-2" />
                                                    {t("addTarget")}
                                                </Button>
                                            </div>
                                        )}
                                        {build === "saas" &&
                                            targets.length > 1 &&
                                            new Set(
                                                targets.map((t) => t.siteId)
                                            ).size > 1 && (
                                                <p className="text-sm text-muted-foreground mt-3">
                                                    {t(
                                                        "proxyMultiSiteRoundRobinNodeHelp"
                                                    )}{" "}
                                                    <a
                                                        href="https://docs.pangolin.net/manage/resources/public/targets#distributing-sites-load-across-servers"
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-primary hover:underline inline-flex items-center gap-1"
                                                    >
                                                        {t("learnMore")}
                                                        <ExternalLink className="size-3.5 shrink-0" />
                                                    </a>
                                                    .
                                                </p>
                                            )}
                                    </SettingsSectionBody>
                                </SettingsSection>
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
                                    disabled={!areAllTargetsValid()}
                                >
                                    {t("resourceCreate")}
                                </Button>
                            </div>
                            {selectedTargetForHealthCheck && (
                                <HealthCheckCredenza
                                    mode="autoSave"
                                    open={healthCheckDialogOpen}
                                    setOpen={setHealthCheckDialogOpen}
                                    targetAddress={`${selectedTargetForHealthCheck.ip}:${selectedTargetForHealthCheck.port}`}
                                    targetMethod={
                                        selectedTargetForHealthCheck.method ||
                                        undefined
                                    }
                                    initialConfig={{
                                        hcEnabled:
                                            selectedTargetForHealthCheck.hcEnabled ||
                                            false,
                                        hcPath:
                                            selectedTargetForHealthCheck.hcPath ||
                                            "/",
                                        hcMethod:
                                            selectedTargetForHealthCheck.hcMethod ||
                                            "GET",
                                        hcInterval:
                                            selectedTargetForHealthCheck.hcInterval ||
                                            5,
                                        hcTimeout:
                                            selectedTargetForHealthCheck.hcTimeout ||
                                            5,
                                        hcHeaders:
                                            selectedTargetForHealthCheck.hcHeaders ||
                                            undefined,
                                        hcScheme:
                                            selectedTargetForHealthCheck.hcScheme ||
                                            undefined,
                                        hcHostname:
                                            selectedTargetForHealthCheck.hcHostname ||
                                            selectedTargetForHealthCheck.ip,
                                        hcPort:
                                            selectedTargetForHealthCheck.hcPort ||
                                            selectedTargetForHealthCheck.port,
                                        hcFollowRedirects:
                                            selectedTargetForHealthCheck.hcFollowRedirects ??
                                            true,
                                        hcStatus:
                                            selectedTargetForHealthCheck.hcStatus ||
                                            undefined,
                                        hcMode:
                                            selectedTargetForHealthCheck.hcMode ||
                                            "http",
                                        hcUnhealthyInterval:
                                            selectedTargetForHealthCheck.hcUnhealthyInterval ||
                                            30,
                                        hcTlsServerName:
                                            selectedTargetForHealthCheck.hcTlsServerName ||
                                            undefined,
                                        hcHealthyThreshold:
                                            selectedTargetForHealthCheck.hcHealthyThreshold ||
                                            1,
                                        hcUnhealthyThreshold:
                                            selectedTargetForHealthCheck.hcUnhealthyThreshold ||
                                            1
                                    }}
                                    onChanges={async (config) => {
                                        if (selectedTargetForHealthCheck) {
                                            console.log(config);
                                            TargetHealthCheck(
                                                selectedTargetForHealthCheck.targetId,
                                                config
                                            );
                                        }
                                    }}
                                />
                            )}
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
                                            `/${orgId}/settings/resources/proxy/${niceId}`
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
