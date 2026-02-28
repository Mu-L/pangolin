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
import { resourceQueries } from "@app/lib/queries";
import { ListSitesResponse } from "@server/routers/site";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
    cleanForFQDN,
    InternalResourceForm,
    type InternalResourceData,
    type InternalResourceFormValues,
    isHostname
} from "./InternalResourceForm";

type Site = ListSitesResponse["sites"][0];

type EditInternalResourceDialogProps = {
    open: boolean;
    setOpen: (val: boolean) => void;
    resource: InternalResourceData;
    orgId: string;
    sites: Site[];
    onSuccess?: () => void;
};

export default function EditInternalResourceDialog({
    open,
    setOpen,
    resource,
    orgId,
    sites,
    onSuccess
}: EditInternalResourceDialogProps) {
    const t = useTranslations();
    const api = createApiClient(useEnvContext());
    const queryClient = useQueryClient();
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

            await api.post(`/site-resource/${resource.id}`, {
                name: data.name,
                siteId: data.siteId,
                mode: data.mode,
                destination: data.destination,
                alias:
                    data.alias &&
                    typeof data.alias === "string" &&
                    data.alias.trim()
                        ? data.alias
                        : null,
                tcpPortRangeString: data.tcpPortRangeString,
                udpPortRangeString: data.udpPortRangeString,
                disableIcmp: data.disableIcmp ?? false,
                ...(data.authDaemonMode != null && {
                    authDaemonMode: data.authDaemonMode
                }),
                ...(data.authDaemonMode === "remote" && {
                    authDaemonPort: data.authDaemonPort || null
                }),
                roleIds: (data.roles || []).map((r) => parseInt(r.id)),
                userIds: (data.users || []).map((u) => u.id),
                clientIds: (data.clients || []).map((c) => parseInt(c.id))
            });

            await queryClient.invalidateQueries(
                resourceQueries.siteResourceRoles({
                    siteResourceId: resource.id
                })
            );
            await queryClient.invalidateQueries(
                resourceQueries.siteResourceUsers({
                    siteResourceId: resource.id
                })
            );
            await queryClient.invalidateQueries(
                resourceQueries.siteResourceClients({
                    siteResourceId: resource.id
                })
            );

            toast({
                title: t("editInternalResourceDialogSuccess"),
                description: t(
                    "editInternalResourceDialogInternalResourceUpdatedSuccessfully"
                ),
                variant: "default"
            });
            setOpen(false);
            onSuccess?.();
        } catch (error) {
            toast({
                title: t("editInternalResourceDialogError"),
                description: formatAxiosError(
                    error,
                    t(
                        "editInternalResourceDialogFailedToUpdateInternalResource"
                    )
                ),
                variant: "destructive"
            });
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <Credenza
            open={open}
            onOpenChange={(isOpen) => {
                if (!isOpen) setOpen(false);
            }}
        >
            <CredenzaContent className="max-w-3xl">
                <CredenzaHeader>
                    <CredenzaTitle>
                        {t("editInternalResourceDialogEditClientResource")}
                    </CredenzaTitle>
                    <CredenzaDescription>
                        {t(
                            "editInternalResourceDialogUpdateResourceProperties",
                            {
                                resourceName: resource.name
                            }
                        )}
                    </CredenzaDescription>
                </CredenzaHeader>
                <CredenzaBody>
                    <InternalResourceForm
                        variant="edit"
                        open={open}
                        resource={resource}
                        sites={sites}
                        orgId={orgId}
                        siteResourceId={resource.id}
                        formId="edit-internal-resource-form"
                        onSubmit={handleSubmit}
                    />
                </CredenzaBody>
                <CredenzaFooter>
                    <CredenzaClose asChild>
                        <Button
                            variant="outline"
                            onClick={() => setOpen(false)}
                            disabled={isSubmitting}
                        >
                            {t("editInternalResourceDialogCancel")}
                        </Button>
                    </CredenzaClose>
                    <Button
                        type="submit"
                        form="edit-internal-resource-form"
                        disabled={isSubmitting}
                        loading={isSubmitting}
                    >
                        {t("editInternalResourceDialogSaveResource")}
                    </Button>
                </CredenzaFooter>
            </CredenzaContent>
        </Credenza>
    );
}
