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
import { ContactSalesBanner } from "@app/components/ContactSalesBanner";
import { useTranslations } from "next-intl";

export interface S3DestinationCredenzaProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editing: any;
    orgId: string;
    onSaved: () => void;
}

export function S3DestinationCredenza({
    open,
    onOpenChange,
    editing,
    orgId,
    onSaved,
}: S3DestinationCredenzaProps) {
    const t = useTranslations();

    return (
        <Credenza open={open} onOpenChange={onOpenChange}>
            <CredenzaContent className="sm:max-w-2xl">
                <CredenzaHeader>
                    <CredenzaTitle>
                        {editing
                            ? t("S3DestEditTitle")
                            : t("S3DestAddTitle")}
                    </CredenzaTitle>
                    <CredenzaDescription>
                        {editing
                            ? t("S3DestEditDescription")
                            : t("S3DestAddDescription")}
                    </CredenzaDescription>
                </CredenzaHeader>

                <CredenzaBody>
                    <ContactSalesBanner />
                </CredenzaBody>

                <CredenzaFooter>
                    <CredenzaClose asChild>
                        <Button variant="outline">{t("cancel")}</Button>
                    </CredenzaClose>
                </CredenzaFooter>
            </CredenzaContent>
        </Credenza>
    );
}
