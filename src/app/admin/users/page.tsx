import { internal } from "@app/lib/api";
import { authCookieHeader } from "@app/lib/api/cookies";
import { AxiosResponse } from "axios";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import { AdminListUsersResponse } from "@server/routers/user/adminListUsers";
import UsersTable, { GlobalUserRow } from "../../../components/AdminUsersTable";
import { Alert, AlertDescription, AlertTitle } from "@app/components/ui/alert";
import { InfoIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

type PageProps = {
    params: Promise<{ orgId: string }>;
};

export const dynamic = "force-dynamic";

export default async function UsersPage(props: PageProps) {
    let rows: AdminListUsersResponse["users"] = [];
    try {
        const res = await internal.get<AxiosResponse<AdminListUsersResponse>>(
            `/users`,
            await authCookieHeader()
        );
        rows = res.data.data.users;
    } catch (e) {
        console.error(e);
    }

    const t = await getTranslations();

    const userRows: GlobalUserRow[] = rows.map((row) => {
        return {
            id: row.id,
            email: row.email,
            name: row.name,
            username: row.username,
            type: row.type,
            idpId: row.idpId,
            idpName: row.idpName || t("idpNameInternal"),
            dateCreated: row.dateCreated,
            serverAdmin: row.serverAdmin,
            twoFactorEnabled: row.twoFactorEnabled,
            twoFactorSetupRequested: row.twoFactorSetupRequested
        };
    });

    return (
        <>
            <SettingsSectionTitle
                title={t("userTitle")}
                description={t("userDescription")}
            />
            <Alert className="mb-6">
                <InfoIcon className="h-4 w-4" />
                <AlertTitle className="font-semibold">
                    {t("userAbount")}
                </AlertTitle>
                <AlertDescription>
                    {t("userAbountDescription")}
                </AlertDescription>
            </Alert>
            <UsersTable users={userRows} />
        </>
    );
}
