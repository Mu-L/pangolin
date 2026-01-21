type DeviceFingerprint = {
    platform: string | null;
    osVersion: string | null;
    kernelVersion?: string | null;
    arch: string | null;
    deviceModel: string | null;
    serialNumber: string | null;
    username: string | null;
    hostname: string | null;
} | null;

/**
 * Formats a platform string to a human-readable format
 */
export function formatPlatform(platform: string | null | undefined): string {
    if (!platform) return "-";
    const platformMap: Record<string, string> = {
        macos: "macOS",
        windows: "Windows",
        linux: "Linux",
        ios: "iOS",
        android: "Android",
        unknown: "Unknown"
    };
    return platformMap[platform.toLowerCase()] || platform;
}

/**
 * Formats device fingerprint information into a human-readable string
 * 
 * @param fingerprint - The device fingerprint object
 * @param t - Translation function from next-intl
 * @returns Formatted string with device information
 */
export function formatFingerprintInfo(
    fingerprint: DeviceFingerprint,
    t: (key: string) => string
): string {
    if (!fingerprint) return "";
    const parts: string[] = [];
    const normalizedPlatform = fingerprint.platform?.toLowerCase() || "unknown";

    if (fingerprint.platform) {
        parts.push(
            `${t("platform")}: ${formatPlatform(fingerprint.platform)}`
        );
    }
    if (fingerprint.deviceModel) {
        parts.push(`${t("deviceModel")}: ${fingerprint.deviceModel}`);
    }
    if (fingerprint.osVersion) {
        parts.push(`${t("osVersion")}: ${fingerprint.osVersion}`);
    }
    if (fingerprint.arch) {
        parts.push(`${t("architecture")}: ${fingerprint.arch}`);
    }
    
    if (normalizedPlatform !== "ios" && normalizedPlatform !== "android") {
        if (fingerprint.hostname) {
            parts.push(`${t("hostname")}: ${fingerprint.hostname}`);
        }
        if (fingerprint.username) {
            parts.push(`${t("username")}: ${fingerprint.username}`);
        }
        if (fingerprint.serialNumber) {
            parts.push(`${t("serialNumber")}: ${fingerprint.serialNumber}`);
        }
    }

    return parts.join("\n");
}
