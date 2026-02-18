"use client";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { createApiClient } from "@app/lib/api";
import {
    keepPreviousData,
    QueryClient,
    QueryClientProvider
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import * as React from "react";

export type ReactQueryProviderProps = {
    children: React.ReactNode;
};

export function TanstackQueryProvider({ children }: ReactQueryProviderProps) {
    const api = createApiClient(useEnvContext());
    const [queryClient] = React.useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        retry: 2, // retry twice by default
                        staleTime: 0,
                        meta: {
                            api
                        },
                        placeholderData: keepPreviousData
                    },
                    mutations: {
                        meta: { api }
                    }
                }
            })
    );
    return (
        <QueryClientProvider client={queryClient}>
            {children}
            <ReactQueryDevtools position="bottom" />
        </QueryClientProvider>
    );
}
