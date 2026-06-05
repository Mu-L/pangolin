"use client";

import { ChevronsUpDown, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
    MultiSitesSelector,
    formatMultiSitesSelectorLabel
} from "./multi-site-selector";
import { SitesSelector, type Selectedsite } from "./site-selector";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

type SingleSiteProps = {
    multiSite?: false;
    selectedSite: Selectedsite | null;
    onSiteChange: (site: Selectedsite | null) => void;
};

type MultiSiteProps = {
    multiSite: true;
    selectedSites: Selectedsite[];
    onSitesChange: (sites: Selectedsite[]) => void;
};

export type BrowserGatewayTargetFormProps = {
    orgId: string;
    destination: string;
    defaultPort: number;
    destinationPort: string;
    onDestinationChange: (v: string) => void;
    onDestinationPortChange: (v: string) => void;
    learnMoreHref?: string;
} & (SingleSiteProps | MultiSiteProps);

export function BrowserGatewayTargetForm(props: BrowserGatewayTargetFormProps) {
    const t = useTranslations();
    const [siteOpen, setSiteOpen] = useState(false);

    const siteSelector =
        props.multiSite === true ? (
            <Popover open={siteOpen} onOpenChange={setSiteOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between font-normal"
                    >
                        <span className="truncate">
                            {formatMultiSitesSelectorLabel(
                                props.selectedSites,
                                t
                            )}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                    <MultiSitesSelector
                        orgId={props.orgId}
                        selectedSites={props.selectedSites}
                        onSelectionChange={props.onSitesChange}
                    />
                </PopoverContent>
            </Popover>
        ) : (
            <Popover open={siteOpen} onOpenChange={setSiteOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between font-normal"
                    >
                        <span className="truncate">
                            {props.selectedSite?.name ?? t("siteSelect")}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                    <SitesSelector
                        orgId={props.orgId}
                        selectedSite={props.selectedSite}
                        onSelectSite={(site) => {
                            props.onSiteChange(site);
                            setSiteOpen(false);
                        }}
                    />
                </PopoverContent>
            </Popover>
        );

    return (
        <div className="space-y-2">
            <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                    <label className="text-sm font-semibold">
                        {t("sites")}
                    </label>
                    {siteSelector}
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-semibold">
                        {t("destination")}
                    </label>
                    <Input
                        value={props.destination}
                        onChange={(e) =>
                            props.onDestinationChange(e.target.value)
                        }
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-semibold">{t("port")}</label>
                    <Input
                        type="number"
                        value={props.destinationPort}
                        onChange={(e) =>
                            props.onDestinationPortChange(e.target.value)
                        }
                    />
                </div>
            </div>
            {props.multiSite === true && props.selectedSites.length > 1 && (
                <p className="text-sm text-muted-foreground">
                    {t("bgTargetMultiSiteDisclaimer")}{" "}
                    <a
                        href={
                            props.learnMoreHref ??
                            "https://docs.pangolin.net/manage/resources/public/ssh"
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                        {t("learnMore")}
                        <ExternalLink className="size-3.5 shrink-0" />
                    </a>
                </p>
            )}
        </div>
    );
}
