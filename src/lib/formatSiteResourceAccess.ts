export type SiteResourceDestinationInput = {
    mode: "host" | "cidr" | "http";
    destination: string;
    destinationPort: number | null;
    scheme: "http" | "https" | null;
};

export function resolveHttpHttpsDisplayPort(
    mode: "http",
    destinationPort: number | null
): number {
    if (destinationPort != null) {
        return destinationPort;
    }
    return 80;
}

export function formatSiteResourceDestinationDisplay(
    row: SiteResourceDestinationInput
): string {
    const { mode, destination, destinationPort, scheme } = row;
    if (mode !== "http") {
        return destination;
    }
    const port = resolveHttpHttpsDisplayPort(mode, destinationPort);
    const downstreamScheme = scheme ?? "http";
    const hostPart =
        destination.includes(":") && !destination.startsWith("[")
            ? `[${destination}]`
            : destination;
    return `${downstreamScheme}://${hostPart}:${port}`;
}
