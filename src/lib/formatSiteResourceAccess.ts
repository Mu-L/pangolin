export type SiteResourceDestinationInput = {
    mode: "host" | "cidr" | "http";
    destination: string;
    httpHttpsPort: number | null;
    scheme: "http" | "https" | null;
};

export function resolveHttpHttpsDisplayPort(
    mode: "http",
    httpHttpsPort: number | null
): number {
    if (httpHttpsPort != null) {
        return httpHttpsPort;
    }
    return 80;
}

export function formatSiteResourceDestinationDisplay(
    row: SiteResourceDestinationInput
): string {
    const { mode, destination, httpHttpsPort, scheme } = row;
    if (mode !== "http") {
        return destination;
    }
    const port = resolveHttpHttpsDisplayPort(mode, httpHttpsPort);
    const downstreamScheme = scheme ?? "http";
    const hostPart =
        destination.includes(":") && !destination.startsWith("[")
            ? `[${destination}]`
            : destination;
    return `${downstreamScheme}://${hostPart}:${port}`;
}
