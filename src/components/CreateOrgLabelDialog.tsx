"use client";

import { useEnvContext } from "@app/hooks/useEnvContext";
import { createApiClient } from "@app/lib/api";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
    Credenza,
    CredenzaBody,
    CredenzaClose,
    CredenzaContent,
    CredenzaDescription,
    CredenzaFooter,
    CredenzaHeader,
    CredenzaTitle
} from "./Credenza";
import { Button } from "./ui/button";

export type CreateOrgLabelDialogProps = {
    open: boolean;
    setOpen: (val: boolean) => void;
    orgId: string;
    onSuccess?: () => void;
};

export function CreateOrgLabelDialog({
    open,
    setOpen,
    orgId,
    onSuccess
}: CreateOrgLabelDialogProps) {
    const t = useTranslations();
    const api = createApiClient(useEnvContext());
    const [isSubmitting, startTransition] = useTransition();

    return (
        <Credenza open={open} onOpenChange={setOpen}>
            <CredenzaContent className="max-w-3xl">
                <CredenzaHeader>
                    <CredenzaTitle>
                        {t("createInternalResourceDialogCreateClientResource")}
                    </CredenzaTitle>
                    <CredenzaDescription>
                        {t(
                            "createInternalResourceDialogCreateClientResourceDescription"
                        )}
                    </CredenzaDescription>
                </CredenzaHeader>
                <CredenzaBody>
                    <></>
                </CredenzaBody>
                <CredenzaFooter>
                    <CredenzaClose asChild>
                        <Button
                            variant="outline"
                            onClick={() => setOpen(false)}
                            disabled={isSubmitting}
                        >
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
