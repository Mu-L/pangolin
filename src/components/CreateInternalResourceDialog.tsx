"use client";

import {
    Credenza,
    CredenzaBody,
    CredenzaClose,
    CredenzaContent,
    CredenzaDescription,
    CredenzaFooter,
    CredenzaHeader,
    CredenzaTitle
} from "@app/components/Credenza";
import { Button } from "@app/components/ui/button";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { toast } from "@app/hooks/useToast";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { ListSitesResponse } from "@server/routers/site";
import { AxiosResponse } from "axios";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
    cleanForFQDN,
    InternalResourceForm,
    isHostname,
    type InternalResourceFormValues
} from "./InternalResourceForm";

type Site = ListSitesResponse["sites"][0];

type CreateInternalResourceDialogProps = {
    open: boolean;
    setOpen: (val: boolean) => void;
    orgId: string;
    sites: Site[];
    onSuccess?: () => void;
};

export default function CreateInternalResourceDialog({
    open,
    setOpen,
    orgId,
    sites,
    onSuccess
}: CreateInternalResourceDialogProps) {
    const t = useTranslations();
    const api = createApiClient(useEnvContext());
    const [isSubmitting, setIsSubmitting] = useState(false);

    async function handleSubmit(values: InternalResourceFormValues) {
        setIsSubmitting(true);
        try {
            let data = { ...values };
            if (data.mode === "host" && isHostname(data.destination)) {
                const currentAlias = data.alias?.trim() || "";
                if (!currentAlias) {
                    let aliasValue = data.destination;
                    if (data.destination.toLowerCase() === "localhost") {
                        aliasValue = `${cleanForFQDN(data.name)}.internal`;
                    }
                    data = { ...data, alias: aliasValue };
                }
            }

            await api.put<AxiosResponse<{ data: { siteResourceId: number } }>>(
                `/org/${orgId}/site-resource`,
                {
                    name: data.name,
                    siteId: data.siteId,
                    mode: data.mode,
                    destination: data.destination,
                    enabled: true,
                    alias: data.alias && typeof data.alias === "string" && data.alias.trim() ? data.alias : undefined,
                    tcpPortRangeString: data.tcpPortRangeString,
                    udpPortRangeString: data.udpPortRangeString,
                    disableIcmp: data.disableIcmp ?? false,
                    ...(data.authDaemonMode != null && { authDaemonMode: data.authDaemonMode }),
                    ...(data.authDaemonMode === "remote" && data.authDaemonPort != null && { authDaemonPort: data.authDaemonPort }),
                    roleIds: data.roles ? data.roles.map((r) => parseInt(r.id)) : [],
                    userIds: data.users ? data.users.map((u) => u.id) : [],
                    clientIds: data.clients ? data.clients.map((c) => parseInt(c.id)) : []
                }
            );

            toast({
                title: t("createInternalResourceDialogSuccess"),
                description: t("createInternalResourceDialogInternalResourceCreatedSuccessfully"),
                variant: "default"
            });
            setOpen(false);
            onSuccess?.();
        } catch (error) {
            toast({
                title: t("createInternalResourceDialogError"),
                description: formatAxiosError(
                    error,
                    t("createInternalResourceDialogFailedToCreateInternalResource")
                ),
                variant: "destructive"
            });
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <Credenza open={open} onOpenChange={setOpen}>
            <CredenzaContent className="max-w-3xl">
                <CredenzaHeader>
                    <CredenzaTitle>{t("createInternalResourceDialogCreateClientResource")}</CredenzaTitle>
                    <CredenzaDescription>
                        {t("createInternalResourceDialogCreateClientResourceDescription")}
                    </CredenzaDescription>
                </CredenzaHeader>
                <CredenzaBody>
                    <InternalResourceForm
                        variant="create"
                        open={open}
                        sites={sites}
                        orgId={orgId}
                        formId="create-internal-resource-form"
                        onSubmit={handleSubmit}
                    />
                </CredenzaBody>
                <CredenzaFooter>
                    <CredenzaClose asChild>
                        <Button variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
                            {t("createInternalResourceDialogCancel")}
                        </Button>
                    </CredenzaClose>
                    <Button
                        type="submit"
                        form="create-internal-resource-form"
                        disabled={isSubmitting}
                        loading={isSubmitting}
                    >
                        {t("createInternalResourceDialogCreateResource")}
                    </Button>
                </CredenzaFooter>
            </CredenzaContent>
        </Credenza>
    );
}
