export type ListHealthChecksResponse = {
    healthChecks: {
        targetHealthCheckId: number;
        name: string;
        hcEnabled: boolean;
        hcHealth: "unknown" | "healthy" | "unhealthy";
        hcMode: string | null;
        hcHostname: string | null;
        hcPort: number | null;
        hcPath: string | null;
        hcScheme: string | null;
        hcMethod: string | null;
        hcInterval: number | null;
        hcUnhealthyInterval: number | null;
        hcTimeout: number | null;
        hcHeaders: string | null;
        hcFollowRedirects: boolean | null;
        hcStatus: number | null;
        hcTlsServerName: string | null;
        hcHealthyThreshold: number | null;
        hcUnhealthyThreshold: number | null;
    }[];
    pagination: {
        total: number;
        limit: number;
        offset: number;
    };
};
