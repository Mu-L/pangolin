"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@app/hooks/useToast";
import { GetBrowserTargetResponse } from "@server/routers/browserGatewayTarget";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription
} from "@app/components/ui/card";
import { Alert, AlertDescription } from "@app/components/ui/alert";
import BrandedAuthSurface from "@app/components/BrandedAuthSurface";
import PoweredByPangolin from "@app/components/PoweredByPangolin";
import { useTranslations } from "next-intl";

type FormState = {
    password: string;
};

export default function VncClient({
    target,
    error,
    primaryColor
}: {
    target: GetBrowserTargetResponse | null;
    error: string | null;
    primaryColor?: string | null;
}) {
    const t = useTranslations();
    const STORAGE_KEY = "pangolin_vnc_credentials";

    const [form, setForm] = useState<FormState>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) return JSON.parse(saved) as FormState;
        } catch {
            // ignore
        }
        return { password: "" };
    });

    const [connected, setConnected] = useState(false);
    const [connectError, setConnectError] = useState<string | null>(null);
    const rfbRef = useRef<any>(null);
    const screenRef = useRef<HTMLDivElement>(null);

    const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    // Disconnect and clean up the RFB instance.
    const disconnect = () => {
        if (rfbRef.current) {
            rfbRef.current.disconnect();
            rfbRef.current = null;
        }
        setConnected(false);
    };

    // Clean up on unmount.
    useEffect(() => {
        return () => disconnect();
    }, []);

    const connect = async () => {
        setConnectError(null);

        if (!target) {
            setConnectError(t("vncNoResourceTarget"));
            return;
        }

        if (!screenRef.current) return;

        // Disconnect any existing session first.
        disconnect();

        // noVNC has no ESM default export — import the module dynamically to
        // keep it out of the server bundle, then grab the default export.
        let RFB: new (
            target: HTMLElement,
            url: string,
            options?: Record<string, unknown>
        ) => unknown;
        try {
            // @ts-expect-error — @novnc/novnc ships plain JS with no bundled types
            const mod = await import("@novnc/novnc");
            RFB = mod.default ?? mod;
        } catch (err) {
            toast({
                variant: "destructive",
                title: t("vncFailedToLoadNovnc"),
                description: `${err}`
            });
            return;
        }

        // Build the proxy WebSocket URL:
        // ws://<proxyAddress>?authToken=<token>&host=<ip>&port=<port>
        const proxyAddress = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/gateway/vnc`;
        const base = proxyAddress.replace(/\/$/, "");
        const params = new URLSearchParams({
            host: target.ip,
            port: String(target.port),
            authToken: target.authToken
        });
        const wsUrl = `${base}?${params.toString()}`;

        // Clear the container so noVNC gets a clean mount point.
        screenRef.current.innerHTML = "";

        const options: Record<string, unknown> = {};
        if (form.password) {
            options.credentials = { password: form.password };
        }

        const rfb: any = new RFB(screenRef.current, wsUrl, options);

        rfb.scaleViewport = true;
        rfb.resizeSession = true;

        rfb.addEventListener("connect", () => {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
            } catch {
                // ignore
            }
            setConnected(true);
        });

        rfb.addEventListener(
            "disconnect",
            (e: { detail: { clean: boolean } }) => {
                rfbRef.current = null;
                setConnected(false);
            }
        );

        rfb.addEventListener(
            "securityfailure",
            (e: { detail: { status: number; reason?: string } }) => {
                disconnect();
                setConnectError(
                    e.detail.reason ??
                        t("vncAuthFailedStatus", {
                            status: e.detail.status
                        })
                );
            }
        );

        rfbRef.current = rfb;
    };

    if (error) {
        return (
            <BrandedAuthSurface primaryColor={primaryColor}>
                <PoweredByPangolin />
                <Card className="w-full">
                    <CardHeader>
                        <CardTitle>{t("vncTitle")}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Alert variant="destructive">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    </CardContent>
                </Card>
            </BrandedAuthSurface>
        );
    }

    return (
        <>
            {!connected && (
                <BrandedAuthSurface primaryColor={primaryColor}>
                    <PoweredByPangolin />
                    <Card className="w-full">
                        <CardHeader>
                            <CardTitle>{t("vncTitle")}</CardTitle>
                            <CardDescription>
                                {t("vncSignInDescription")}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <Field
                                    label={t("vncPasswordOptional")}
                                    id="password"
                                >
                                    <Input
                                        id="password"
                                        type="password"
                                        value={form.password}
                                        onChange={(e) =>
                                            update("password", e.target.value)
                                        }
                                    />
                                </Field>

                                {connectError && (
                                    <Alert variant="destructive">
                                        <AlertDescription>
                                            {connectError}
                                        </AlertDescription>
                                    </Alert>
                                )}

                                <Button onClick={connect} className="w-full">
                                    {t("browserGatewayConnect")}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </BrandedAuthSurface>
            )}

            <div
                className="fixed inset-0 z-50 flex flex-col bg-neutral-900"
                style={{ display: connected ? "flex" : "none" }}
            >
                <div className="flex flex-wrap items-center gap-2 bg-black p-2 text-white">
                    <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                            if (rfbRef.current) {
                                rfbRef.current.sendCtrlAltDel();
                            }
                        }}
                    >
                        {t("browserGatewayCtrlAltDel")}
                    </Button>
                    <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                            navigator.clipboard
                                ?.readText()
                                .then((text) => {
                                    rfbRef.current?.clipboardPasteFrom(text);
                                })
                                .catch(() => {});
                        }}
                    >
                        {t("vncPasteClipboard")}
                    </Button>
                    <Button
                        size="sm"
                        variant="destructive"
                        onClick={disconnect}
                    >
                        {t("sshTerminate")}
                    </Button>
                </div>

                {/* noVNC mounts a <canvas> inside this div */}
                <div
                    ref={screenRef}
                    className="flex-1 overflow-hidden"
                    style={{ background: "#000" }}
                />
            </div>
        </>
    );
}

function Field({
    label,
    id,
    children
}: {
    label: string;
    id: string;
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-1.5">
            <Label htmlFor={id}>{label}</Label>
            {children}
        </div>
    );
}
