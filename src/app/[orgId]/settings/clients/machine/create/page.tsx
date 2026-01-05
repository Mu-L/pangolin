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
import { StrategySelect } from "@app/components/StrategySelect";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@app/components/ui/form";
import HeaderTitle from "@app/components/SettingsSectionTitle";
import { z } from "zod";
import { createElement, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@app/components/ui/input";
import { ChevronDown, ChevronUp, InfoIcon, Terminal } from "lucide-react";
import { Button } from "@app/components/ui/button";
import CopyTextBox from "@app/components/CopyTextBox";
import CopyToClipboard from "@app/components/CopyToClipboard";
import {
    InfoSection,
    InfoSectionContent,
    InfoSections,
    InfoSectionTitle
} from "@app/components/InfoSection";
import {
    FaApple,
    FaCubes,
    FaDocker,
    FaFreebsd,
    FaWindows
} from "react-icons/fa";
import { SiNixos, SiKubernetes } from "react-icons/si";
import { Alert, AlertDescription, AlertTitle } from "@app/components/ui/alert";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import {
    CreateClientBody,
    CreateClientResponse,
    PickClientDefaultsResponse
} from "@server/routers/client";
import { ListSitesResponse } from "@server/routers/site";
import { toast } from "@app/hooks/useToast";
import { AxiosResponse } from "axios";
import { useParams, useRouter } from "next/navigation";
import { Tag, TagInput } from "@app/components/tags/tag-input";

import { useTranslations } from "next-intl";

type ClientType = "olm";

interface TunnelTypeOption {
    id: ClientType;
    title: string;
    description: string;
    disabled?: boolean;
}

type CommandItem = string | { title: string; command: string };

type Commands = {
    unix: Record<string, CommandItem[]>;
    windows: Record<string, CommandItem[]>;
};

const platforms = ["unix", "windows"] as const;

type Platform = (typeof platforms)[number];

export default function Page() {
    const { env } = useEnvContext();
    const api = createApiClient({ env });
    const { orgId } = useParams();
    const router = useRouter();
    const t = useTranslations();

    const createClientFormSchema = z.object({
        name: z
            .string()
            .min(2, { message: t("nameMin", { len: 2 }) })
            .max(30, { message: t("nameMax", { len: 30 }) }),
        method: z.enum(["olm"]),
        subnet: z.union([z.ipv4(), z.ipv6()]).refine((val) => val.length > 0, {
            message: t("subnetRequired")
        })
    });

    type CreateClientFormValues = z.infer<typeof createClientFormSchema>;

    const [tunnelTypes, setTunnelTypes] = useState<
        ReadonlyArray<TunnelTypeOption>
    >([
        {
            id: "olm",
            title: t("olmTunnel"),
            description: t("olmTunnelDescription"),
            disabled: true
        }
    ]);

    const [loadingPage, setLoadingPage] = useState(true);

    const [platform, setPlatform] = useState<Platform>("unix");
    const [architecture, setArchitecture] = useState("All");
    const [commands, setCommands] = useState<Commands | null>(null);

    const [olmId, setOlmId] = useState("");
    const [olmSecret, setOlmSecret] = useState("");
    const [olmCommand, setOlmCommand] = useState("");

    const [createLoading, setCreateLoading] = useState(false);
    const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

    const [clientDefaults, setClientDefaults] =
        useState<PickClientDefaultsResponse | null>(null);

    const hydrateCommands = (
        id: string,
        secret: string,
        endpoint: string,
        version: string
    ) => {
        const commands = {
            unix: {
                All: [
                    {
                        title: t("install"),
                        command: `curl -fsSL https://static.pangolin.net/get-olm.sh | bash`
                    },
                    {
                        title: t("run"),
                        command: `sudo olm --id ${id} --secret ${secret} --endpoint ${endpoint}`
                    }
                ]
            },
            windows: {
                x64: [
                    {
                        title: t("install"),
                        command: `curl -o olm.exe -L "https://github.com/fosrl/olm/releases/download/${version}/olm_windows_installer.exe"`
                    },
                    {
                        title: t("run"),
                        command: `olm.exe --id ${id} --secret ${secret} --endpoint ${endpoint}`
                    }
                ]
            }
        };
        setCommands(commands);
    };

    const getArchitectures = () => {
        switch (platform) {
            case "unix":
                return ["All"];
            case "windows":
                return ["x64"];
            default:
                return ["x64"];
        }
    };

    const getPlatformName = (platformName: string) => {
        switch (platformName) {
            case "windows":
                return "Windows";
            case "unix":
                return "Unix & macOS";
            case "docker":
                return "Docker";
            default:
                return "Unix & macOS";
        }
    };

    const getCommand = (): CommandItem[] => {
        const placeholder: CommandItem[] = [t("unknownCommand")];
        if (!commands) {
            return placeholder;
        }
        let platformCommands = commands[platform as keyof Commands];

        if (!platformCommands) {
            // get first key
            const firstPlatform = Object.keys(commands)[0] as Platform;
            platformCommands = commands[firstPlatform as keyof Commands];

            setPlatform(firstPlatform);
        }

        let architectureCommands = platformCommands[architecture];
        if (!architectureCommands) {
            // get first key
            const firstArchitecture = Object.keys(platformCommands)[0];
            architectureCommands = platformCommands[firstArchitecture];

            setArchitecture(firstArchitecture);
        }

        return architectureCommands || placeholder;
    };

    const getPlatformIcon = (platformName: string) => {
        switch (platformName) {
            case "windows":
                return <FaWindows className="h-4 w-4 mr-2" />;
            case "unix":
                return <Terminal className="h-4 w-4 mr-2" />;
            case "docker":
                return <FaDocker className="h-4 w-4 mr-2" />;
            case "kubernetes":
                return <SiKubernetes className="h-4 w-4 mr-2" />;
            case "podman":
                return <FaCubes className="h-4 w-4 mr-2" />;
            case "freebsd":
                return <FaFreebsd className="h-4 w-4 mr-2" />;
            case "nixos":
                return <SiNixos className="h-4 w-4 mr-2" />;
            default:
                return <Terminal className="h-4 w-4 mr-2" />;
        }
    };

    const form = useForm<CreateClientFormValues>({
        resolver: zodResolver(createClientFormSchema),
        defaultValues: {
            name: "",
            method: "olm",
            subnet: ""
        }
    });

    async function onSubmit(data: CreateClientFormValues) {
        setCreateLoading(true);

        if (!clientDefaults) {
            toast({
                variant: "destructive",
                title: t("errorCreatingClient"),
                description: t("clientDefaultsNotFound")
            });
            setCreateLoading(false);
            return;
        }

        const payload: CreateClientBody = {
            name: data.name,
            type: data.method as "olm",
            olmId: clientDefaults.olmId,
            secret: clientDefaults.olmSecret,
            subnet: data.subnet
        };

        const res = await api
            .put<
                AxiosResponse<CreateClientResponse>
            >(`/org/${orgId}/client`, payload)
            .catch((e) => {
                toast({
                    variant: "destructive",
                    title: t("errorCreatingClient"),
                    description: formatAxiosError(e)
                });
            });

        if (res && res.status === 201) {
            const data = res.data.data;
            router.push(`/${orgId}/settings/clients/machine/${data.niceId}`);
        }

        setCreateLoading(false);
    }

    useEffect(() => {
        const load = async () => {
            setLoadingPage(true);

            // Fetch available sites

            // const res = await api.get<AxiosResponse<ListSitesResponse>>(
            //     `/org/${orgId}/sites/`
            // );
            // const sites = res.data.data.sites.filter(
            //     (s) => s.type === "newt" && s.subnet
            // );
            // setSites(
            //     sites.map((site) => ({
            //         id: site.siteId.toString(),
            //         text: site.name
            //     }))
            // );

            let olmVersion = "latest";

            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000);

                const response = await fetch(
                    `https://api.github.com/repos/fosrl/olm/releases/latest`,
                    { signal: controller.signal }
                );

                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(
                        t("olmErrorFetchReleases", {
                            err: response.statusText
                        })
                    );
                }
                const data = await response.json();
                const latestVersion = data.tag_name;
                olmVersion = latestVersion;
            } catch (error) {
                if (error instanceof Error && error.name === "AbortError") {
                    console.error(t("olmErrorFetchTimeout"));
                } else {
                    console.error(
                        t("olmErrorFetchLatest", {
                            err:
                                error instanceof Error
                                    ? error.message
                                    : String(error)
                        })
                    );
                }
            }

            await api
                .get(`/org/${orgId}/pick-client-defaults`)
                .catch((e) => {
                    form.setValue("method", "olm");
                })
                .then((res) => {
                    if (res && res.status === 200) {
                        const data = res.data.data;

                        setClientDefaults(data);

                        const olmId = data.olmId;
                        const olmSecret = data.olmSecret;
                        const olmCommand = `olm --id ${olmId} --secret ${olmSecret} --endpoint ${env.app.dashboardUrl}`;

                        setOlmId(olmId);
                        setOlmSecret(olmSecret);
                        setOlmCommand(olmCommand);

                        hydrateCommands(
                            olmId,
                            olmSecret,
                            env.app.dashboardUrl,
                            olmVersion
                        );

                        if (data.subnet) {
                            form.setValue("subnet", data.subnet);
                        }

                        setTunnelTypes((prev: any) => {
                            return prev.map((item: any) => {
                                return { ...item, disabled: false };
                            });
                        });
                    }
                });

            setLoadingPage(false);
        };

        load();
    }, []);

    return (
        <>
            <div className="flex justify-between">
                <HeaderTitle
                    title={t("createClient")}
                    description={t("createClientDescription")}
                />
                <Button
                    variant="outline"
                    onClick={() => {
                        router.push(`/${orgId}/settings/clients`);
                    }}
                >
                    {t("seeAllClients")}
                </Button>
            </div>

            {!loadingPage && (
                <div>
                    <SettingsContainer>
                        <SettingsSection>
                            <SettingsSectionHeader>
                                <SettingsSectionTitle>
                                    {t("clientInformation")}
                                </SettingsSectionTitle>
                            </SettingsSectionHeader>
                            <SettingsSectionBody>
                                <Form {...form}>
                                    <form
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault(); // block default enter refresh
                                            }
                                        }}
                                        className="space-y-4 grid gap-4 grid-cols-1 md:grid-cols-2 items-start"
                                        id="create-client-form"
                                    >
                                        <FormField
                                            control={form.control}
                                            name="name"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>
                                                        {t("name")}
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            autoComplete="off"
                                                            {...field}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                    <FormDescription>
                                                        {t(
                                                            "clientNameDescription"
                                                        )}
                                                    </FormDescription>
                                                </FormItem>
                                            )}
                                        />
                                        <div className="flex items-center justify-end md:col-start-2">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() =>
                                                    setShowAdvancedSettings(
                                                        !showAdvancedSettings
                                                    )
                                                }
                                                className="flex items-center gap-2"
                                            >
                                                {showAdvancedSettings ? (
                                                    <ChevronUp className="h-4 w-4" />
                                                ) : (
                                                    <ChevronDown className="h-4 w-4" />
                                                )}
                                                {t("advancedSettings")}
                                            </Button>
                                        </div>
                                        {showAdvancedSettings && (
                                            <FormField
                                                control={form.control}
                                                name="subnet"
                                                render={({ field }) => (
                                                    <FormItem className="md:col-start-1 md:col-span-2">
                                                        <FormLabel>
                                                            {t("clientAddress")}
                                                        </FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                autoComplete="off"
                                                                placeholder={t(
                                                                    "subnetPlaceholder"
                                                                )}
                                                                {...field}
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                        <FormDescription>
                                                            {t(
                                                                "addressDescription"
                                                            )}
                                                        </FormDescription>
                                                    </FormItem>
                                                )}
                                            />
                                        )}
                                    </form>
                                </Form>
                            </SettingsSectionBody>
                        </SettingsSection>

                        {form.watch("method") === "olm" && (
                            <>
                                <SettingsSection>
                                    <SettingsSectionHeader>
                                        <SettingsSectionTitle>
                                            {t("clientOlmCredentials")}
                                        </SettingsSectionTitle>
                                        <SettingsSectionDescription>
                                            {t(
                                                "clientOlmCredentialsDescription"
                                            )}
                                        </SettingsSectionDescription>
                                    </SettingsSectionHeader>
                                    <SettingsSectionBody>
                                        <InfoSections cols={3}>
                                            <InfoSection>
                                                <InfoSectionTitle>
                                                    {t("olmEndpoint")}
                                                </InfoSectionTitle>
                                                <InfoSectionContent>
                                                    <CopyToClipboard
                                                        text={
                                                            env.app.dashboardUrl
                                                        }
                                                    />
                                                </InfoSectionContent>
                                            </InfoSection>
                                            <InfoSection>
                                                <InfoSectionTitle>
                                                    {t("olmId")}
                                                </InfoSectionTitle>
                                                <InfoSectionContent>
                                                    <CopyToClipboard
                                                        text={olmId}
                                                    />
                                                </InfoSectionContent>
                                            </InfoSection>
                                            <InfoSection>
                                                <InfoSectionTitle>
                                                    {t("olmSecretKey")}
                                                </InfoSectionTitle>
                                                <InfoSectionContent>
                                                    <CopyToClipboard
                                                        text={olmSecret}
                                                    />
                                                </InfoSectionContent>
                                            </InfoSection>
                                        </InfoSections>
                                    </SettingsSectionBody>
                                </SettingsSection>
                                <SettingsSection>
                                    <SettingsSectionHeader>
                                        <SettingsSectionTitle>
                                            {t("clientInstallOlm")}
                                        </SettingsSectionTitle>
                                        <SettingsSectionDescription>
                                            {t("clientInstallOlmDescription")}
                                        </SettingsSectionDescription>
                                    </SettingsSectionHeader>
                                    <SettingsSectionBody>
                                        <div>
                                            <p className="font-bold mb-3">
                                                {t("operatingSystem")}
                                            </p>
                                            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                                                {platforms.map((os) => (
                                                    <Button
                                                        key={os}
                                                        variant={
                                                            platform === os
                                                                ? "squareOutlinePrimary"
                                                                : "squareOutline"
                                                        }
                                                        className={`flex-1 min-w-[120px] ${platform === os ? "bg-primary/10" : ""} shadow-none`}
                                                        onClick={() => {
                                                            setPlatform(os);
                                                        }}
                                                    >
                                                        {getPlatformIcon(os)}
                                                        {getPlatformName(os)}
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <p className="font-bold mb-3">
                                                {["docker", "podman"].includes(
                                                    platform
                                                )
                                                    ? t("method")
                                                    : t("architecture")}
                                            </p>
                                            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                                                {getArchitectures().map(
                                                    (arch) => (
                                                        <Button
                                                            key={arch}
                                                            variant={
                                                                architecture ===
                                                                arch
                                                                    ? "squareOutlinePrimary"
                                                                    : "squareOutline"
                                                            }
                                                            className={`flex-1 min-w-[120px] ${architecture === arch ? "bg-primary/10" : ""} shadow-none`}
                                                            onClick={() =>
                                                                setArchitecture(
                                                                    arch
                                                                )
                                                            }
                                                        >
                                                            {arch}
                                                        </Button>
                                                    )
                                                )}
                                            </div>
                                            <div className="pt-4">
                                                <p className="font-bold mb-3">
                                                    {t("commands")}
                                                </p>
                                                <div className="mt-2 space-y-3">
                                                    {getCommand().map(
                                                        (item, index) => {
                                                            const commandText =
                                                                typeof item ===
                                                                "string"
                                                                    ? item
                                                                    : item.command;
                                                            const title =
                                                                typeof item ===
                                                                "string"
                                                                    ? undefined
                                                                    : item.title;

                                                            return (
                                                                <div
                                                                    key={index}
                                                                >
                                                                    {title && (
                                                                        <p className="text-sm font-medium mb-1.5">
                                                                            {
                                                                                title
                                                                            }
                                                                        </p>
                                                                    )}
                                                                    <CopyTextBox
                                                                        text={
                                                                            commandText
                                                                        }
                                                                        outline={
                                                                            true
                                                                        }
                                                                    />
                                                                </div>
                                                            );
                                                        }
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </SettingsSectionBody>
                                </SettingsSection>
                            </>
                        )}
                    </SettingsContainer>

                    <div className="flex justify-end space-x-2 mt-8">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                router.push(`/${orgId}/settings/clients`);
                            }}
                        >
                            {t("cancel")}
                        </Button>
                        <Button
                            type="button"
                            loading={createLoading}
                            disabled={createLoading}
                            onClick={() => {
                                form.handleSubmit(onSubmit)();
                            }}
                        >
                            {t("createClient")}
                        </Button>
                    </div>
                </div>
            )}
        </>
    );
}
