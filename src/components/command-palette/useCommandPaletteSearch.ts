"use client";

import { orgQueries } from "@app/lib/queries";
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { useDebounce } from "use-debounce";

const SEARCH_PER_PAGE = 5;
const MIN_QUERY_LENGTH = 2;

export type SiteSearchResult = {
    id: string;
    name: string;
    href: string;
};

export type ResourceSearchResult = {
    id: string;
    name: string;
    href: string;
};

export type UserSearchResult = {
    id: string;
    name: string;
    email: string;
    href: string;
};

export type ClientSearchResult = {
    id: string;
    name: string;
    href: string;
};

export function useCommandPaletteSearch({
    orgId,
    query,
    enabled
}: {
    orgId?: string;
    query: string;
    enabled: boolean;
}) {
    const [debouncedQuery] = useDebounce(query, 150);
    const trimmedQuery = debouncedQuery.trim();
    const shouldSearch =
        enabled && !!orgId && trimmedQuery.length >= MIN_QUERY_LENGTH;

    const [sitesQuery, resourcesQuery, usersQuery, clientsQuery] = useQueries({
        queries: [
            {
                ...orgQueries.sites({
                    orgId: orgId ?? "",
                    query: trimmedQuery,
                    perPage: SEARCH_PER_PAGE
                }),
                enabled: shouldSearch
            },
            {
                ...orgQueries.resources({
                    orgId: orgId ?? "",
                    query: trimmedQuery,
                    perPage: SEARCH_PER_PAGE
                }),
                enabled: shouldSearch
            },
            {
                ...orgQueries.users({
                    orgId: orgId ?? "",
                    query: trimmedQuery,
                    perPage: SEARCH_PER_PAGE
                }),
                enabled: shouldSearch
            },
            {
                ...orgQueries.machineClients({
                    orgId: orgId ?? "",
                    query: trimmedQuery,
                    perPage: SEARCH_PER_PAGE
                }),
                enabled: shouldSearch
            }
        ]
    });

    const sites = useMemo((): SiteSearchResult[] => {
        if (!orgId || !sitesQuery.data) return [];
        return sitesQuery.data.map((site) => ({
            id: `site-${site.siteId}`,
            name: site.name,
            href: `/${orgId}/settings/sites/${site.niceId}`
        }));
    }, [orgId, sitesQuery.data]);

    const resources = useMemo((): ResourceSearchResult[] => {
        if (!orgId || !resourcesQuery.data) return [];
        return resourcesQuery.data.map((resource) => ({
            id: `resource-${resource.resourceId}`,
            name: resource.name,
            href: `/${orgId}/settings/resources/proxy/${resource.niceId}`
        }));
    }, [orgId, resourcesQuery.data]);

    const users = useMemo((): UserSearchResult[] => {
        if (!orgId || !usersQuery.data) return [];
        return usersQuery.data.map((user) => ({
            id: `user-${user.id}`,
            name: user.name ?? user.email ?? user.username ?? "",
            email: user.email ?? user.username ?? "",
            href: `/${orgId}/settings/access/users/${user.id}`
        }));
    }, [orgId, usersQuery.data]);

    const machineClients = useMemo((): ClientSearchResult[] => {
        if (!orgId || !clientsQuery.data) return [];
        return clientsQuery.data
            .filter((client) => !client.userId)
            .map((client) => ({
                id: `client-${client.clientId}`,
                name: client.name,
                href: `/${orgId}/settings/clients/machine/${client.niceId}`
            }));
    }, [orgId, clientsQuery.data]);

    const isLoading =
        shouldSearch &&
        (sitesQuery.isFetching ||
            resourcesQuery.isFetching ||
            usersQuery.isFetching ||
            clientsQuery.isFetching);

    return {
        debouncedQuery: trimmedQuery,
        shouldSearch,
        sites,
        resources,
        users,
        machineClients,
        isLoading
    };
}
