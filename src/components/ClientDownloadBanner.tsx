"use client";

import React from "react";
import { Button } from "@app/components/ui/button";
import { Download } from "lucide-react";
import { FaApple, FaWindows, FaLinux } from "react-icons/fa";
import { useTranslations } from "next-intl";
import Link from "next/link";
import DismissableBanner from "./DismissableBanner";

export const ClientDownloadBanner = () => {
    const t = useTranslations();

    return (
        <DismissableBanner
            storageKey="client-download-banner-dismissed"
            version={1}
            title={t("downloadClientBannerTitle")}
            titleIcon={<Download className="w-5 h-5 text-primary" />}
            description={t("downloadClientBannerDescription")}
        >
            <Link
                href="https://pangolin.net/downloads/mac"
                target="_blank"
                rel="noopener noreferrer"
            >
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 hover:bg-primary/10 hover:border-primary/50 transition-colors"
                >
                    <FaApple className="w-4 h-4" />
                    Mac
                </Button>
            </Link>
            <Link
                href="https://pangolin.net/downloads/windows"
                target="_blank"
                rel="noopener noreferrer"
            >
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 hover:bg-primary/10 hover:border-primary/50 transition-colors"
                >
                    <FaWindows className="w-4 h-4" />
                    Windows
                </Button>
            </Link>
            <Link
                href="https://pangolin.net/downloads/linux"
                target="_blank"
                rel="noopener noreferrer"
            >
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 hover:bg-primary/10 hover:border-primary/50 transition-colors"
                >
                    <FaLinux className="w-4 h-4" />
                    Linux
                </Button>
            </Link>
        </DismissableBanner>
    );
};

export default ClientDownloadBanner;
