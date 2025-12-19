import type { ClientRow } from "@app/components/MachineClientsTable";
import MachineClientsTable from "@app/components/MachineClientsTable";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import MachineClientsBanner from "@app/components/MachineClientsBanner";
import { internal } from "@app/lib/api";
import { authCookieHeader } from "@app/lib/api/cookies";
import { ListClientsResponse } from "@server/routers/client";
import { AxiosResponse } from "axios";
import { getTranslations } from "next-intl/server";

type ClientsPageProps = {
    params: Promise<{ orgId: string }>;
    searchParams: Promise<{ view?: string }>;
};

export const dynamic = "force-dynamic";

export default async function ClientsPage(props: ClientsPageProps) {
    const t = await getTranslations();

    const params = await props.params;

    let machineClients: ListClientsResponse["clients"] = [];

    try {
        const machineRes = await internal.get<
            AxiosResponse<ListClientsResponse>
        >(
            `/org/${params.orgId}/clients?filter=machine`,
            await authCookieHeader()
        );
        machineClients = machineRes.data.data.clients;
    } catch (e) {}

    function formatSize(mb: number): string {
        if (mb >= 1024 * 1024) {
            return `${(mb / (1024 * 1024)).toFixed(2)} TB`;
        } else if (mb >= 1024) {
            return `${(mb / 1024).toFixed(2)} GB`;
        } else {
            return `${mb.toFixed(2)} MB`;
        }
    }

    const mapClientToRow = (
        client: ListClientsResponse["clients"][0]
    ): ClientRow => {
        return {
            name: client.name,
            id: client.clientId,
            subnet: client.subnet.split("/")[0],
            mbIn: formatSize(client.megabytesIn || 0),
            mbOut: formatSize(client.megabytesOut || 0),
            orgId: params.orgId,
            online: client.online,
            olmVersion: client.olmVersion || undefined,
            olmUpdateAvailable: client.olmUpdateAvailable || false,
            userId: client.userId,
            username: client.username,
            userEmail: client.userEmail,
            niceId: client.niceId,
            agent: client.agent
        };
    };

    const machineClientRows: ClientRow[] = machineClients.map(mapClientToRow);

    return (
        <>
            <SettingsSectionTitle
                title={t("manageMachineClients")}
                description={t("manageMachineClientsDescription")}
            />

            <MachineClientsBanner orgId={params.orgId} />

            <MachineClientsTable
                machineClients={machineClientRows}
                orgId={params.orgId}
            />
        </>
    );
}
