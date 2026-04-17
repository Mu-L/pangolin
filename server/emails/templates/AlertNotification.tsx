import React from "react";
import { Body, Head, Html, Preview, Tailwind } from "@react-email/components";
import { themeColors } from "./lib/theme";
import {
    EmailContainer,
    EmailFooter,
    EmailGreeting,
    EmailHeading,
    EmailInfoSection,
    EmailLetterHead,
    EmailSignature,
    EmailText
} from "./components/Email";

export type AlertEventType =
    | "site_online"
    | "site_offline"
    | "health_check_healthy"
    | "health_check_not_healthy";

interface Props {
    eventType: AlertEventType;
    orgId: string;
    data: Record<string, unknown>;
}

function getEventMeta(eventType: AlertEventType): {
    heading: string;
    previewText: string;
    summary: string;
    statusLabel: string;
    statusColor: string;
} {
    switch (eventType) {
        case "site_online":
            return {
                heading: "Site Back Online",
                previewText: "A site in your organization is back online.",
                summary:
                    "Good news – a site in your organization has come back online and is now reachable.",
                statusLabel: "Online",
                statusColor: "#16a34a"
            };
        case "site_offline":
            return {
                heading: "Site Offline",
                previewText: "A site in your organization has gone offline.",
                summary:
                    "A site in your organization has gone offline and is no longer reachable. Please investigate as soon as possible.",
                statusLabel: "Offline",
                statusColor: "#dc2626"
            };
        case "health_check_healthy":
            return {
                heading: "Health Check Recovered",
                previewText:
                    "A health check in your organization is now healthy.",
                summary:
                    "A health check in your organization has recovered and is now reporting a healthy status.",
                statusLabel: "Healthy",
                statusColor: "#16a34a"
            };
        case "health_check_not_healthy":
            return {
                heading: "Health Check Failing",
                previewText:
                    "A health check in your organization is not healthy.",
                summary:
                    "A health check in your organization is currently failing. Please review the details below and take action if needed.",
                statusLabel: "Not Healthy",
                statusColor: "#dc2626"
            };
    }
}

function formatDataItems(
    data: Record<string, unknown>
): { label: string; value: React.ReactNode }[] {
    return Object.entries(data)
        .filter(([key]) => key !== "orgId")
        .map(([key, value]) => ({
            label: key
                .replace(/([A-Z])/g, " $1")
                .replace(/^./, (s) => s.toUpperCase())
                .trim(),
            value: String(value ?? "-")
        }));
}

export const AlertNotification = ({ eventType, orgId, data }: Props) => {
    const meta = getEventMeta(eventType);
    const dataItems = formatDataItems(data);

    const allItems: { label: string; value: React.ReactNode }[] = [
        { label: "Organization", value: orgId },
        { label: "Status", value: (
            <span style={{ color: meta.statusColor, fontWeight: 600 }}>
                {meta.statusLabel}
            </span>
        )},
        { label: "Time", value: new Date().toUTCString() },
        ...dataItems
    ];

    return (
        <Html>
            <Head />
            <Preview>{meta.previewText}</Preview>
            <Tailwind config={themeColors}>
                <Body className="font-sans bg-gray-50">
                    <EmailContainer>
                        <EmailLetterHead />

                        <EmailHeading>{meta.heading}</EmailHeading>

                        <EmailGreeting>Hi there,</EmailGreeting>

                        <EmailText>{meta.summary}</EmailText>

                        <EmailInfoSection
                            title="Event Details"
                            items={allItems}
                        />

                        <EmailText>
                            Log in to your dashboard to view more details and
                            manage your alert rules.
                        </EmailText>

                        <EmailFooter>
                            <EmailSignature />
                        </EmailFooter>
                    </EmailContainer>
                </Body>
            </Tailwind>
        </Html>
    );
};

export default AlertNotification;
