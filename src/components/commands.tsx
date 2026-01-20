import { useTranslations } from "next-intl";
import CopyTextBox from "./CopyTextBox";

import type { id } from "date-fns/locale";

// function getCommand():  CommandItem[] {
//     const placeholder: CommandItem[] = [t("unknownCommand")];
//     if (!commands) {
//         return placeholder;
//     }
//     let platformCommands = commands[platform as keyof Commands];

//     if (!platformCommands) {
//         // get first key
//         const firstPlatform = Object.keys(commands)[0] as Platform;
//         platformCommands = commands[firstPlatform as keyof Commands];

//         setPlatform(firstPlatform);
//     }

//     let architectureCommands = platformCommands[architecture];
//     if (!architectureCommands) {
//         // get first key
//         const firstArchitecture = Object.keys(platformCommands)[0];
//         architectureCommands = platformCommands[firstArchitecture];

//         setArchitecture(firstArchitecture);
//     }

//     return architectureCommands || placeholder;
// };

export type CommandItem = string | { title: string; command: string };

type CommandByPlatform = {
    unix: Record<string, CommandItem[]>;
    windows: Record<string, CommandItem[]>;
    docker: Record<string, CommandItem[]>;
    kubernetes: Record<string, CommandItem[]>;
    podman: Record<string, CommandItem[]>;
    nixos: Record<string, CommandItem[]>;
};
type Platform = keyof CommandByPlatform;

export type SiteCommandsProps = {
    id: string;
    secret: string;
    endpoint: string;
    version: string;
    acceptClients: boolean;
    platform: Platform;
};

export function SiteCommands({
    acceptClients,
    id,
    secret,
    endpoint,
    version,
    platform
}: SiteCommandsProps) {
    const t = useTranslations();

    const acceptClientsFlag = !acceptClients ? " --disable-clients" : "";
    const acceptClientsEnv = !acceptClients
        ? "\n      - DISABLE_CLIENTS=true"
        : "";

    const commandList: Record<Platform, Record<string, CommandItem[]>> = {
        unix: {
            All: [
                {
                    title: t("install"),
                    command: `curl -fsSL https://static.pangolin.net/get-newt.sh | bash`
                },
                {
                    title: t("run"),
                    command: `newt --id ${id} --secret ${secret} --endpoint ${endpoint}${acceptClientsFlag}`
                }
            ]
        },
        windows: {
            x64: [
                {
                    title: t("install"),
                    command: `curl -o newt.exe -L "https://github.com/fosrl/newt/releases/download/${version}/newt_windows_amd64.exe"`
                },
                {
                    title: t("run"),
                    command: `newt.exe --id ${id} --secret ${secret} --endpoint ${endpoint}${acceptClientsFlag}`
                }
            ]
        },
        docker: {
            "Docker Compose": [
                `services:
  newt:
    image: fosrl/newt
    container_name: newt
    restart: unless-stopped
    environment:
      - PANGOLIN_ENDPOINT=${endpoint}
      - NEWT_ID=${id}
      - NEWT_SECRET=${secret}${acceptClientsEnv}`
            ],
            "Docker Run": [
                `docker run -dit fosrl/newt --id ${id} --secret ${secret} --endpoint ${endpoint}${acceptClientsFlag}`
            ]
        },
        kubernetes: {
            "Helm Chart": [
                `helm repo add fossorial https://charts.fossorial.io`,
                `helm repo update fossorial`,
                `helm install newt fossorial/newt \\
    --create-namespace \\
    --set newtInstances[0].name="main-tunnel" \\
    --set-string newtInstances[0].auth.keys.endpointKey="${endpoint}" \\
    --set-string newtInstances[0].auth.keys.idKey="${id}" \\
    --set-string newtInstances[0].auth.keys.secretKey="${secret}"`
            ]
        },
        podman: {
            "Podman Quadlet": [
                `[Unit]
Description=Newt container

[Container]
ContainerName=newt
Image=docker.io/fosrl/newt
Environment=PANGOLIN_ENDPOINT=${endpoint}
Environment=NEWT_ID=${id}
Environment=NEWT_SECRET=${secret}${!acceptClients ? "\nEnvironment=DISABLE_CLIENTS=true" : ""}
# Secret=newt-secret,type=env,target=NEWT_SECRET

[Service]
Restart=always

[Install]
WantedBy=default.target`
            ],
            "Podman Run": [
                `podman run -dit docker.io/fosrl/newt --id ${id} --secret ${secret} --endpoint ${endpoint}${acceptClientsFlag}`
            ]
        },
        nixos: {
            All: [
                `nix run 'nixpkgs#fosrl-newt' -- --id ${id} --secret ${secret} --endpoint ${endpoint}${acceptClientsFlag}`
            ]
        }
    };

    const commands = commandList[platform];

    return (
        <div className="mt-2 flex flex-col gap-3">
            {[].map((item, index) => {
                const commandText =
                    typeof item === "string" ? item : item.command;
                const title = typeof item === "string" ? undefined : item.title;

                return (
                    <div key={index}>
                        {title && (
                            <p className="text-sm font-medium mb-1.5">
                                {title}
                            </p>
                        )}
                        <CopyTextBox text={commandText} outline={true} />
                    </div>
                );
            })}
        </div>
    );
}
