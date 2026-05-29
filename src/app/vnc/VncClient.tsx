"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@app/hooks/useToast";
import { GetBrowserTargetResponse } from "@server/routers/resource";
import { Card, CardContent } from "@app/components/ui/card";
import LoginCardHeader from "@app/components/LoginCardHeader";

type FormState = {
    password: string;
};

export default function VncClient({
    target,
    error
}: {
    target: GetBrowserTargetResponse | null;
    error: string | null;
}) {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const connect = async () => {
        if (!target) {
            toast({
                variant: "destructive",
                title: "No target",
                description: "No resource target is available"
            });
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
                title: "Failed to load noVNC",
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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
                toast({
                    variant: "destructive",
                    title: "Authentication failed",
                    description: e.detail.reason ?? `Status ${e.detail.status}`
                });
            }
        );

        rfbRef.current = rfb;
    };

    if (error) {
        return (
            <Card className="w-full">
                <LoginCardHeader subtitle="VNC" />
                <CardContent className="pt-6">
                    <p className="text-destructive text-sm">{error}</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <>
            {!connected && (
                <Card className="w-full">
                    <LoginCardHeader subtitle="Connect via VNC" />
                    <CardContent className="pt-6">
                        <div className="space-y-4">
                            <Field label="Password (optional)" id="password">
                                <Input
                                    id="password"
                                    type="password"
                                    value={form.password}
                                    onChange={(e) =>
                                        update("password", e.target.value)
                                    }
                                />
                            </Field>

                            <Button onClick={connect} className="w-full">
                                Connect
                            </Button>
                        </div>
                    </CardContent>
                </Card>
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
                        Ctrl+Alt+Del
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
                        Paste clipboard
                    </Button>
                    <Button
                        size="sm"
                        variant="destructive"
                        onClick={disconnect}
                    >
                        Terminate
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
