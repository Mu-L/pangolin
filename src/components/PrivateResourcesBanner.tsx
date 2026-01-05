"use client";

import React from "react";
import { Button } from "@app/components/ui/button";
import { Shield, ArrowRight, Laptop, Server } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import DismissableBanner from "./DismissableBanner";

type PrivateResourcesBannerProps = {
    orgId: string;
};

export const PrivateResourcesBanner = ({
    orgId
}: PrivateResourcesBannerProps) => {
    const t = useTranslations();

    return (
        <DismissableBanner
            storageKey="private-resources-banner-dismissed"
            version={1}
            title={t("privateResourcesBannerTitle")}
            titleIcon={<Shield className="w-5 h-5 text-primary" />}
            description={t("privateResourcesBannerDescription")}
        >
            <Link href={`/${orgId}/settings/clients/user`}>
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 hover:bg-primary/10 hover:border-primary/50 transition-colors"
                >
                    <Laptop className="w-4 h-4" />
                    {t("sidebarUserDevices")}
                    <ArrowRight className="w-4 h-4" />
                </Button>
            </Link>
            <Link href={`/${orgId}/settings/clients/machine`}>
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 hover:bg-primary/10 hover:border-primary/50 transition-colors"
                >
                    <Server className="w-4 h-4" />
                    {t("sidebarMachineClients")}
                    <ArrowRight className="w-4 h-4" />
                </Button>
            </Link>
        </DismissableBanner>
    );
};

export default PrivateResourcesBanner;
