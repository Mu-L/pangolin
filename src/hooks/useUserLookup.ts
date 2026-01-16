import { useState } from "react";
import { createApiClient } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { AxiosResponse } from "axios";
import { LookupUserResponse } from "@server/routers/auth/lookupUser";

type UseUserLookupResult = {
    lookup: (identifier: string) => Promise<LookupUserResponse | null>;
    loading: boolean;
    error: string | null;
};

export function useUserLookup(): UseUserLookupResult {
    const { env } = useEnvContext();
    const api = createApiClient({ env });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const lookup = async (
        identifier: string
    ): Promise<LookupUserResponse | null> => {
        setLoading(true);
        setError(null);

        try {
            const response = await api.post<
                AxiosResponse<LookupUserResponse>
            >("/auth/lookup-user", {
                identifier: identifier.toLowerCase().trim()
            });

            if (response.data.data) {
                return response.data.data;
            }

            setError("Failed to lookup user");
            return null;
        } catch (err: any) {
            const errorMessage =
                err.response?.data?.message ||
                err.message ||
                "An error occurred during lookup";
            setError(errorMessage);
            return null;
        } finally {
            setLoading(false);
        }
    };

    return { lookup, loading, error };
}
