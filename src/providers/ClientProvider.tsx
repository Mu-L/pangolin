"use client";

import ClientContext from "@app/contexts/clientContext";
import { GetClientResponse } from "@server/routers/client/getClient";
import { useState, useEffect } from "react";

interface ClientProviderProps {
    children: React.ReactNode;
    client: GetClientResponse;
}

export function ClientProvider({
    children,
    client: serverClient
}: ClientProviderProps) {
    const [client, setClient] = useState<GetClientResponse>(serverClient);

    // Sync client state when server client changes (e.g., after router.refresh())
    useEffect(() => {
        setClient(serverClient);
    }, [serverClient]);

    const updateClient = (updatedClient: Partial<GetClientResponse>) => {
        if (!client) {
            throw new Error("No client to update");
        }
        setClient((prev) => {
            if (!prev) {
                return prev;
            }
            return {
                ...prev,
                ...updatedClient
            };
        });
    };

    return (
        <ClientContext.Provider value={{ client, updateClient }}>
            {children}
        </ClientContext.Provider>
    );
}

export default ClientProvider;
