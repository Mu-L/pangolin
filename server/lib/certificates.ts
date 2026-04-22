export async function getValidCertificatesForDomains(
    domains: Set<string>,
    useCache: boolean
): Promise<
    Array<{
        id: number;
        domain: string;
        wildcard: boolean | null;
        certFile: string | null;
        keyFile: string | null;
        expiresAt: number | null;
        updatedAt?: number | null;
    }>
> {
    return []; // stub
}
