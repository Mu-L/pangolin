import { Terminal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FaDocker, FaWindows } from "react-icons/fa";
import CopyTextBox from "./CopyTextBox";
import {
    SettingsSection,
    SettingsSectionBody,
    SettingsSectionDescription,
    SettingsSectionHeader,
    SettingsSectionTitle
} from "./Settings";
import { Button } from "./ui/button";

export type CommandItem = string | { title: string; command: string };

const PLATFORMS = ["unix", "windows", "docker"] as const;

type Platform = (typeof PLATFORMS)[number];

export type OlmInstallCommandsProps = {
    id: string;
    secret: string;
    endpoint: string;
    version?: string;
};

export function OlmInstallCommands({
    id,
    secret,
    endpoint,
    version = "latest"
}: OlmInstallCommandsProps) {
    const t = useTranslations();

    const [platform, setPlatform] = useState<Platform>("unix");
    const [architecture, setArchitecture] = useState(
        () => getArchitectures(platform)[0]
    );

    const commandList: Record<Platform, Record<string, CommandItem[]>> = {
        unix: {
            All: [
                {
                    title: t("install"),
                    command: `curl -fsSL https://static.pangolin.net/get-cli.sh | bash`
                },
                {
                    title: t("run"),
                    command: `sudo pangolin up --id ${id} --secret ${secret} --endpoint ${endpoint} --attach`
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
        },
        docker: {
            "Docker Compose": [
                `services:
  olm:
    image: fosrl/olm
    container_name: olm
    restart: unless-stopped
    network_mode: host
    cap_add:
      - NET_ADMIN
    devices:
      - /dev/net/tun:/dev/net/tun
    environment:
      - PANGOLIN_ENDPOINT=${endpoint}
      - OLM_ID=${id}
      - OLM_SECRET=${secret}`
            ],
            "Docker Run": [
                `docker run -dit --network host --cap-add NET_ADMIN --device /dev/net/tun:/dev/net/tun fosrl/olm --id ${id} --secret ${secret} --endpoint ${endpoint}`
            ]
        }
    };

    const commands = commandList[platform][architecture];
    return (
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
                    <p className="font-bold mb-3">{t("operatingSystem")}</p>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                        {PLATFORMS.map((os) => (
                            <Button
                                key={os}
                                variant={
                                    platform === os
                                        ? "squareOutlinePrimary"
                                        : "squareOutline"
                                }
                                className={`flex-1 min-w-30 ${platform === os ? "bg-primary/10" : ""} shadow-none`}
                                onClick={() => {
                                    setPlatform(os);
                                    const architectures = getArchitectures(os);
                                    setArchitecture(architectures[0]);
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
                        {["docker", "podman"].includes(platform)
                            ? t("method")
                            : t("architecture")}
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                        {getArchitectures(platform).map((arch) => (
                            <Button
                                key={arch}
                                variant={
                                    architecture === arch
                                        ? "squareOutlinePrimary"
                                        : "squareOutline"
                                }
                                className={`flex-1 min-w-30 ${architecture === arch ? "bg-primary/10" : ""} shadow-none`}
                                onClick={() => setArchitecture(arch)}
                            >
                                {arch}
                            </Button>
                        ))}
                    </div>
                    <div className="pt-4">
                        <p className="font-bold mb-3">{t("commands")}</p>
                        <div className="mt-2 space-y-3">
                            {commands.map((item, index) => {
                                const commandText =
                                    typeof item === "string"
                                        ? item
                                        : item.command;
                                const title =
                                    typeof item === "string"
                                        ? undefined
                                        : item.title;

                                return (
                                    <div key={index}>
                                        {title && (
                                            <p className="text-sm font-medium mb-1.5">
                                                {title}
                                            </p>
                                        )}
                                        <CopyTextBox
                                            text={commandText}
                                            outline={true}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </SettingsSectionBody>
        </SettingsSection>
    );
}

function getArchitectures(platform: Platform) {
    switch (platform) {
        case "unix":
            return ["All"];
        case "windows":
            return ["x64"];
        case "docker":
            return ["Docker Compose", "Docker Run"];
        default:
            return ["x64"];
    }
}

function getPlatformName(platformName: Platform) {
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
}

function getPlatformIcon(platformName: Platform) {
    switch (platformName) {
        case "windows":
            return <FaWindows className="h-4 w-4 mr-2" />;
        case "unix":
            return <Terminal className="h-4 w-4 mr-2" />;
        case "docker":
            return <FaDocker className="h-4 w-4 mr-2" />;
        default:
            return <Terminal className="h-4 w-4 mr-2" />;
    }
}
