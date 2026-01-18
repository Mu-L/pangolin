import { internal } from "@app/lib/api";
import { authCookieHeader } from "@app/lib/api/cookies";
import { AxiosResponse } from "axios";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import { ListClientsResponse } from "@server/routers/client";
import { getTranslations } from "next-intl/server";
import type { ClientRow } from "@app/components/UserDevicesTable";
import UserDevicesTable from "@app/components/UserDevicesTable";

type ClientsPageProps = {
    params: Promise<{ orgId: string }>;
};

export const dynamic = "force-dynamic";

export default async function ClientsPage(props: ClientsPageProps) {
    const t = await getTranslations();

    const params = await props.params;

    let userClients: ListClientsResponse["clients"] = [];

    try {
        const userRes = await internal.get<AxiosResponse<ListClientsResponse>>(
            `/org/${params.orgId}/clients?filter=user`,
            await authCookieHeader()
        );
        userClients = userRes.data.data.clients;
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
        // Build fingerprint object if any fingerprint data exists
        const hasFingerprintData =
            (client as any).fingerprintPlatform ||
            (client as any).fingerprintOsVersion ||
            (client as any).fingerprintKernelVersion ||
            (client as any).fingerprintArch ||
            (client as any).fingerprintSerialNumber ||
            (client as any).fingerprintUsername ||
            (client as any).fingerprintHostname ||
            (client as any).deviceModel;

        const fingerprint = hasFingerprintData
            ? {
                  platform: (client as any).fingerprintPlatform || null,
                  osVersion: (client as any).fingerprintOsVersion || null,
                  kernelVersion:
                      (client as any).fingerprintKernelVersion || null,
                  arch: (client as any).fingerprintArch || null,
                  deviceModel: (client as any).deviceModel || null,
                  serialNumber:
                      (client as any).fingerprintSerialNumber || null,
                  username: (client as any).fingerprintUsername || null,
                  hostname: (client as any).fingerprintHostname || null
              }
            : null;

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
            agent: client.agent,
            archived: client.archived || false,
            blocked: client.blocked || false,
            approvalState: client.approvalState,
            fingerprint
        };
    };

    const userClientRows: ClientRow[] = userClients.map(mapClientToRow);

    return (
        <>
            <SettingsSectionTitle
                title={t("manageUserDevices")}
                description={t("manageUserDevicesDescription")}
            />

            <UserDevicesTable
                userClients={userClientRows}
                orgId={params.orgId}
            />
        </>
    );
}
