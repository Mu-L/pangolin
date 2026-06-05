"use client";

import { cn } from "@app/lib/cn";
import { ChevronsUpDown, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { Control, FieldValues, Path } from "react-hook-form";
import { useWatch } from "react-hook-form";
import {
    MultiSitesSelector,
    formatMultiSitesSelectorLabel
} from "./multi-site-selector";
import { SitesSelector, type Selectedsite } from "./site-selector";
import { Button } from "./ui/button";
import {
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "./ui/form";
import { Input } from "./ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

type BaseProps<T extends FieldValues> = {
    control: Control<T>;
    orgId: string;
    destinationField: Path<T>;
    destinationPortField: Path<T>;
    learnMoreHref?: string;
    defaultPort: number;
};

type MultiSiteFormProps<T extends FieldValues> = BaseProps<T> & {
    multiSite: true;
    sitesField: Path<T>;
};

type SingleSiteFormProps<T extends FieldValues> = BaseProps<T> & {
    multiSite?: false;
    siteField: Path<T>;
};

export type BrowserGatewayTargetFormProps<T extends FieldValues = FieldValues> =
    | MultiSiteFormProps<T>
    | SingleSiteFormProps<T>;

export function BrowserGatewayTargetForm<T extends FieldValues>(
    props: BrowserGatewayTargetFormProps<T>
) {
    const t = useTranslations();
    const [siteOpen, setSiteOpen] = useState(false);

    const sitesFieldName =
        props.multiSite === true ? props.sitesField : props.siteField;

    const watchedSites = useWatch({
        control: props.control,
        name: sitesFieldName
    });

    const showMultiSiteDisclaimer =
        props.multiSite === true &&
        ((watchedSites as Selectedsite[] | undefined)?.length ?? 0) > 1;

    return (
        <div className="space-y-2">
            <div className="grid grid-cols-3 gap-4 items-start">
                <FormField
                    control={props.control}
                    name={sitesFieldName}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t("sites")}</FormLabel>
                            <Popover open={siteOpen} onOpenChange={setSiteOpen}>
                                <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            className={cn(
                                                "w-full justify-between font-normal",
                                                "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
                                                props.multiSite === true
                                                    ? (
                                                          field.value as Selectedsite[]
                                                      )?.length === 0 &&
                                                          "text-muted-foreground"
                                                    : !field.value &&
                                                          "text-muted-foreground"
                                            )}
                                        >
                                            <span className="truncate">
                                                {props.multiSite === true
                                                    ? formatMultiSitesSelectorLabel(
                                                          (field.value as Selectedsite[]) ??
                                                              [],
                                                          t
                                                      )
                                                    : ((
                                                          field.value as Selectedsite | null
                                                      )?.name ??
                                                      t("siteSelect"))}
                                            </span>
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                                    {props.multiSite === true ? (
                                        <MultiSitesSelector
                                            orgId={props.orgId}
                                            selectedSites={
                                                (field.value as Selectedsite[]) ??
                                                []
                                            }
                                            onSelectionChange={field.onChange}
                                        />
                                    ) : (
                                        <SitesSelector
                                            orgId={props.orgId}
                                            selectedSite={
                                                field.value as Selectedsite | null
                                            }
                                            onSelectSite={(site) => {
                                                field.onChange(site);
                                                setSiteOpen(false);
                                            }}
                                        />
                                    )}
                                </PopoverContent>
                            </Popover>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={props.control}
                    name={props.destinationField}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t("destination")}</FormLabel>
                            <FormControl>
                                <Input {...field} value={field.value ?? ""} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={props.control}
                    name={props.destinationPortField}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t("port")}</FormLabel>
                            <FormControl>
                                <Input
                                    type="number"
                                    min={1}
                                    max={65535}
                                    {...field}
                                    value={field.value ?? ""}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>
            {showMultiSiteDisclaimer && (
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
