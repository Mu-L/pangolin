import { orgQueries } from "@app/lib/queries";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList
} from "./ui/command";
import { Checkbox } from "./ui/checkbox";
import { useTranslations } from "next-intl";
import { useDebounce } from "use-debounce";
import type { Selectedsite } from "./site-selector";

export type MultiSitesSelectorProps = {
    orgId: string;
    selectedSites: Selectedsite[];
    onSelectionChange: (sites: Selectedsite[]) => void;
    filterTypes?: string[];
};

export function formatMultiSitesSelectorLabel(
    selectedSites: Selectedsite[],
    t: (key: string, values?: { count: number }) => string
): string {
    if (selectedSites.length === 0) {
        return t("selectSites");
    }
    if (selectedSites.length === 1) {
        return selectedSites[0]!.name;
    }
    return t("multiSitesSelectorSitesCount", {
        count: selectedSites.length
    });
}

export function MultiSitesSelector({
    orgId,
    selectedSites,
    onSelectionChange,
    filterTypes
}: MultiSitesSelectorProps) {
    const t = useTranslations();
    const [siteSearchQuery, setSiteSearchQuery] = useState("");
    const [debouncedQuery] = useDebounce(siteSearchQuery, 150);

    const { data: sites = [] } = useQuery(
        orgQueries.sites({
            orgId,
            query: debouncedQuery,
            perPage: 10
        })
    );

    const sitesShown = useMemo(() => {
        const base = filterTypes
            ? sites.filter((s) => filterTypes.includes(s.type))
            : [...sites];
        if (debouncedQuery.trim().length === 0 && selectedSites.length > 0) {
            const selectedNotInBase = selectedSites.filter(
                (sel) => !base.some((s) => s.siteId === sel.siteId)
            );
            return [...selectedNotInBase, ...base];
        }
        return base;
    }, [debouncedQuery, sites, selectedSites, filterTypes]);

    const selectedIds = useMemo(
        () => new Set(selectedSites.map((s) => s.siteId)),
        [selectedSites]
    );

    const toggleSite = (site: Selectedsite) => {
        if (selectedIds.has(site.siteId)) {
            onSelectionChange(
                selectedSites.filter((s) => s.siteId !== site.siteId)
            );
        } else {
            onSelectionChange([...selectedSites, site]);
        }
    };

    return (
        <Command shouldFilter={false}>
            <CommandInput
                placeholder={t("siteSearch")}
                value={siteSearchQuery}
                onValueChange={(v) => setSiteSearchQuery(v)}
            />
            <CommandList>
                <CommandEmpty>{t("siteNotFound")}</CommandEmpty>
                <CommandGroup>
                    {sitesShown.map((site) => (
                        <CommandItem
                            key={site.siteId}
                            value={`${site.siteId}:${site.name}`}
                            onSelect={() => {
                                toggleSite(site);
                            }}
                        >
                            <Checkbox
                                className="pointer-events-none shrink-0"
                                checked={selectedIds.has(site.siteId)}
                                onCheckedChange={() => {}}
                                aria-hidden
                                tabIndex={-1}
                            />
                            <span className="truncate">{site.name}</span>
                        </CommandItem>
                    ))}
                </CommandGroup>
            </CommandList>
        </Command>
    );
}
