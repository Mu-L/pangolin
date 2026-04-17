"use client";

import { useState, useEffect } from "react";
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
import { Plus, X, KeyRound, ExternalLink } from "lucide-react";
import Link from "next/link";
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
                    <div className="rounded-md border border-black-500/30 bg-linear-to-br from-black-500/10 via-background to-background overflow-hidden">
                        <div className="py-3 px-4">
                            <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                                <KeyRound className="size-4 shrink-0 text-black-500" />
                                <span>
                                    Contact sales to enable this feature.{" "}
                                    <Link
                                        href="https://click.fossorial.io/ep922"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 font-medium text-black-600 underline"
                                    >
                                        Book a demo
                                        <ExternalLink className="size-3.5 shrink-0" />
                                    </Link>
                                    {" or "}
                                    <Link
                                        href="https://pangolin.net/contact"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 font-medium text-black-600 underline"
                                    >
                                        contact us
                                        <ExternalLink className="size-3.5 shrink-0" />
                                    </Link>
                                    .
                                </span>
                            </div>
                        </div>
                    </div>
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
