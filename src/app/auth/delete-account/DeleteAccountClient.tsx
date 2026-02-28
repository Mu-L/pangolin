"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@app/components/ui/button";
import DeleteAccountConfirmDialog from "@app/components/DeleteAccountConfirmDialog";
import UserProfileCard from "@app/components/UserProfileCard";
import { ArrowLeft } from "lucide-react";
import { createApiClient } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { toast } from "@app/hooks/useToast";
import { formatAxiosError } from "@app/lib/api";

type DeleteAccountClientProps = {
    displayName: string;
};

export default function DeleteAccountClient({
    displayName
}: DeleteAccountClientProps) {
    const router = useRouter();
    const t = useTranslations();
    const { env } = useEnvContext();
    const api = createApiClient({ env });
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    function handleUseDifferentAccount() {
        api.post("/auth/logout")
            .catch((e) => {
                console.error(t("logoutError"), e);
                toast({
                    title: t("logoutError"),
                    description: formatAxiosError(e, t("logoutError"))
                });
            })
            .then(() => {
                router.push(
                    "/auth/login?internal_redirect=/auth/delete-account"
                );
                router.refresh();
            });
    }

    return (
        <div className="space-y-6">
            <UserProfileCard
                identifier={displayName}
                description={t("signingAs")}
                onUseDifferentAccount={handleUseDifferentAccount}
                useDifferentAccountText={t("deviceLoginUseDifferentAccount")}
            />
            <p className="text-sm text-muted-foreground">
                {t("deleteAccountDescription")}
            </p>
            <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => router.back()}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    {t("back")}
                </Button>
                <Button
                    variant="destructive"
                    onClick={() => setIsDialogOpen(true)}
                >
                    {t("deleteAccountButton")}
                </Button>
            </div>
            <DeleteAccountConfirmDialog
                open={isDialogOpen}
                setOpen={setIsDialogOpen}
            />
        </div>
    );
}
