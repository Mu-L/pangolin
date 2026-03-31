import { orgQueries } from "@app/lib/queries";
import type { ListSitesResponse } from "@server/routers/site";
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
import { cn } from "@app/lib/cn";
import { CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useDebounce } from "use-debounce";

export type Selectedsite = Pick<
    ListSitesResponse["sites"][number],
    "name" | "siteId" | "type"
>;

export type SitesSelectorProps = {
    orgId: string;
    selectedSite?: Selectedsite | null;
    onSelectSite: (selected: Selectedsite) => void;
};

export function SitesSelector({
    orgId,
    selectedSite,
    onSelectSite
}: SitesSelectorProps) {
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

    // always include the selected site in the list of sites shown
    const sitesShown = useMemo(() => {
        const allSites: Array<Selectedsite> = [...sites];
        if (
            debouncedQuery.trim().length === 0 &&
            selectedSite &&
            !allSites.find((site) => site.siteId === selectedSite?.siteId)
        ) {
            allSites.unshift(selectedSite);
        }
        return allSites;
    }, [debouncedQuery, sites, selectedSite]);

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
                                onSelectSite(site);
                            }}
                        >
                            <CheckIcon
                                className={cn(
                                    "mr-2 h-4 w-4",
                                    site.siteId === selectedSite?.siteId
                                        ? "opacity-100"
                                        : "opacity-0"
                                )}
                            />
                            {site.name}
                        </CommandItem>
                    ))}
                </CommandGroup>
            </CommandList>
        </Command>
    );
}
