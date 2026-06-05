"use client";

import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GetBrowserTargetResponse } from "@server/routers/browserGatewayTarget";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription
} from "@app/components/ui/card";
import Link from "next/link";
import { ExternalLink, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { HorizontalTabs } from "@app/components/HorizontalTabs";
import type { SignSshKeyResponse } from "@server/routers/ssh/types";
import { useTranslations } from "next-intl";
import BrandedAuthSurface from "@app/components/BrandedAuthSurface";
import PoweredByPangolin from "@app/components/PoweredByPangolin";

type AuthTab = "password" | "privateKey";

type FormState = {
    username: string;
    password: string;
    privateKey: string;
};

type ConnectCredentials = {
    username: string;
    password?: string;
    privateKey?: string;
    certificate?: string;
};

export default function SshClient({
    target,
    error,
    signedKeyData,
    privateKey: signedPrivateKey,
    primaryColor
}: {
    target: GetBrowserTargetResponse | null;
    error: string | null;
    signedKeyData?: SignSshKeyResponse | null;
    privateKey?: string | null;
    primaryColor?: string | null;
}) {
    const STORAGE_KEY = "pangolin_ssh_credentials";

    const [form, setForm] = useState<FormState>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) return JSON.parse(saved) as FormState;
        } catch {
            // ignore
        }
        return { username: "", password: "", privateKey: "" };
    });

    const t = useTranslations();

    function handleKeyFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target?.result;
            if (typeof text === "string") {
                setForm((prev) => ({ ...prev, privateKey: text }));
            }
        };
        reader.readAsText(file);
        // Reset input so the same file can be re-selected if needed.
        e.target.value = "";
    }

    const [connected, setConnected] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [connectError, setConnectError] = useState<string | null>(null);

    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<import("@xterm/xterm").Terminal | null>(null);
    const fitAddonRef = useRef<import("@xterm/addon-fit").FitAddon | null>(
        null
    );
    const wsRef = useRef<WebSocket | null>(null);

    // Mount the terminal div once connected.
    useEffect(() => {
        if (!connected || !terminalRef.current) return;

        let cancelled = false;

        (async () => {
            const [{ Terminal }, { FitAddon }, { WebLinksAddon }] =
                await Promise.all([
                    import("@xterm/xterm"),
                    import("@xterm/addon-fit"),
                    import("@xterm/addon-web-links")
                ]);
            if (cancelled || !terminalRef.current) return;

            const terminal = new Terminal({
                cursorBlink: true,
                fontSize: 14,
                fontFamily: "Menlo, Monaco, 'Courier New', monospace",
                theme: {
                    background: "#0d0d0d",
                    foreground: "#f0f0f0"
                },
                scrollback: 5000
            });

            const fitAddon = new FitAddon();
            const webLinksAddon = new WebLinksAddon();
            terminal.loadAddon(fitAddon);
            terminal.loadAddon(webLinksAddon);

            terminal.open(terminalRef.current);
            fitAddon.fit();

            xtermRef.current = terminal;
            fitAddonRef.current = fitAddon;

            // Send user keystrokes to the WebSocket.
            terminal.onData((data) => {
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({ type: "data", data }));
                }
            });

            // Send resize events.
            terminal.onResize(({ cols, rows }) => {
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(
                        JSON.stringify({ type: "resize", cols, rows })
                    );
                }
            });

            // Send the initial size once the terminal is rendered.
            const { cols, rows } = terminal;
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(
                    JSON.stringify({ type: "resize", cols, rows })
                );
            }
        })().catch(console.error);

        return () => {
            cancelled = true;
        };
    }, [connected]);

    // Refit terminal when the window resizes.
    useEffect(() => {
        const onResize = () => fitAddonRef.current?.fit();
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    // Cleanup on unmount.
    useEffect(() => {
        return () => {
            wsRef.current?.close();
            xtermRef.current?.dispose();
        };
    }, []);

    // Auto-connect when signed key data is provided (push PAM mode).
    useEffect(() => {
        if (signedKeyData && signedPrivateKey && target) {
            connect({
                username: signedKeyData.sshUsername,
                privateKey: signedPrivateKey,
                certificate: signedKeyData.certificate
            });
        }
    }, []);

    function connect(
        override?: ConnectCredentials,
        authMethod: AuthTab = "password"
    ) {
        setConnectError(null);
        setConnecting(true);

        if (!target) {
            setConnectError(t("sshErrorNoTarget"));
            setConnecting(false);
            return;
        }

        const username = override?.username ?? form.username;
        const password =
            override?.password ??
            (authMethod === "password" ? form.password : "");
        const privateKey =
            override?.privateKey ??
            (authMethod === "privateKey" ? form.privateKey : "");
        const certificate = override?.certificate;

        const proxyAddress = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/gateway/ssh`;
        const url = new URL(proxyAddress);
        url.searchParams.set(
            "mode",
            target.authDaemonMode === "native" ? "native" : "proxy"
        );
        if (target.authDaemonMode !== "native") {
            url.searchParams.set("host", target.ip ?? "");
            url.searchParams.set("port", String(target.port ?? 22));
        }
        url.searchParams.set("username", username);
        url.searchParams.set("authToken", target.authToken ?? "");

        const ws = new WebSocket(url.toString(), ["ssh"]);
        wsRef.current = ws;

        // Track whether the server has confirmed auth by sending the first
        // data frame. Until then, errors are shown in the login form.
        let authConfirmed = false;
        let authErrorShown = false;

        ws.onopen = () => {
            // Send credentials as the first frame so the proxy can complete
            // SSH authentication before piping pty data. Stay in "connecting"
            // state until the server responds - this prevents the flash to the
            // terminal page that would occur if we set connected=true here.
            ws.send(
                JSON.stringify({
                    type: "auth",
                    password,
                    privateKey,
                    certificate
                })
            );
            if (!override) {
                try {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
                } catch {
                    // ignore
                }
            }
        };

        ws.onmessage = (evt) => {
            if (typeof evt.data === "string") {
                try {
                    const msg = JSON.parse(evt.data as string) as {
                        type: string;
                        data?: string;
                        error?: string;
                    };
                    if (msg.type === "data" && msg.data) {
                        if (!authConfirmed) {
                            authConfirmed = true;
                            setConnecting(false);
                            setConnected(true);
                        }
                        xtermRef.current?.write(msg.data);
                    } else if (msg.type === "error") {
                        if (!authConfirmed) {
                            // Auth-phase error - show in the login form.
                            authErrorShown = true;
                            setConnecting(false);
                            setConnectError(
                                msg.error ?? t("sshErrorAuthFailed")
                            );
                        } else {
                            xtermRef.current?.writeln(
                                `\r\n\x1b[31m${t("sshTerminalError", { error: msg.error ?? "" })}\x1b[0m\r\n`
                            );
                        }
                    }
                } catch {
                    if (!authConfirmed) {
                        authConfirmed = true;
                        setConnecting(false);
                        setConnected(true);
                    }
                    xtermRef.current?.write(evt.data);
                }
            } else if (evt.data instanceof Blob) {
                evt.data.text().then((text) => {
                    if (!authConfirmed) {
                        authConfirmed = true;
                        setConnecting(false);
                        setConnected(true);
                    }
                    xtermRef.current?.write(text);
                });
            }
        };

        ws.onerror = () => {
            setConnecting(false);
            setConnected(false);
            setConnectError(t("sshErrorWebSocket"));
        };

        ws.onclose = (evt) => {
            setConnecting(false);
            if (authConfirmed) {
                setConnected(false);
                xtermRef.current?.writeln(
                    `\r\n\x1b[33m${t("sshConnectionClosedCode", { code: evt.code })}\x1b[0m\r\n`
                );
            }
            // If auth was never confirmed the login form is already visible;
            // a generic error is shown only when no specific error was received.
            if (!authConfirmed && !authErrorShown) {
                setConnectError(t("sshErrorConnectionClosed"));
            }
        };
    }

    function disconnect() {
        wsRef.current?.close();
        xtermRef.current?.dispose();
        xtermRef.current = null;
        setConnected(false);
    }

    // In push mode, show a connecting/connected state without the login form.
    if (signedKeyData && signedPrivateKey) {
        return (
            <>
                {!connected && (
                    <div className="flex items-center justify-center">
                        <Card className="w-full max-w-md">
                            <CardHeader>
                                <CardTitle>{t("sshTitle")}</CardTitle>
                                <CardDescription>
                                    {t("sshConnectingDescription")}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="flex flex-col items-center space-y-4">
                                {!connectError && (
                                    <div className="flex items-center space-x-2">
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                        <span>
                                            {connecting
                                                ? t("sshConnecting")
                                                : t("sshInitializing")}
                                        </span>
                                    </div>
                                )}
                                {connectError && (
                                    <Alert variant="destructive" className="w-full">
                                        <AlertDescription>
                                            {connectError}
                                        </AlertDescription>
                                    </Alert>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                )}
                {connected && (
                    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-900">
                        <div
                            ref={terminalRef}
                            className="flex-1 overflow-hidden"
                            style={{ minHeight: 0 }}
                        />
                    </div>
                )}
            </>
        );
    }

    if (error) {
        return (
            <BrandedAuthSurface primaryColor={primaryColor}>
                <PoweredByPangolin />
                <Card className="w-full">
                    <CardHeader>
                        <CardTitle>{t("sshTitle")}</CardTitle>
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
                            <CardTitle>{t("sshSignInTitle")}</CardTitle>
                            <CardDescription>
                                {t("sshSignInDescription")}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <HorizontalTabs
                                clientSide
                                defaultTab={0}
                                items={[
                                    { title: t("sshPasswordTab"), href: "#" },
                                    { title: t("sshPrivateKeyTab"), href: "#" }
                                ]}
                            >
                                <div className="space-y-4 mt-4 p-1">
                                    <Field
                                        label={t("username")}
                                        id="username-pw"
                                    >
                                        <Input
                                            id="username-pw"
                                            value={form.username}
                                            onChange={(e) =>
                                                setForm({
                                                    ...form,
                                                    username: e.target.value
                                                })
                                            }
                                        />
                                    </Field>
                                    <Field label={t("password")} id="password">
                                        <Input
                                            id="password"
                                            type="password"
                                            value={form.password}
                                            onChange={(e) =>
                                                setForm({
                                                    ...form,
                                                    password: e.target.value
                                                })
                                            }
                                        />
                                    </Field>
                                    <div className="mt-4 space-y-3">
                                        {connectError && (
                                            <Alert variant="destructive">
                                                <AlertDescription>
                                                    {connectError}
                                                </AlertDescription>
                                            </Alert>
                                        )}

                                        <Button
                                            onClick={() =>
                                                connect(undefined, "password")
                                            }
                                            loading={connecting}
                                            disabled={
                                                !form.username || !form.password
                                            }
                                            className="w-full"
                                        >
                                            {connecting
                                                ? t("sshConnecting")
                                                : t("sshAuthenticate")}
                                        </Button>
                                    </div>
                                </div>

                                <div className="space-y-4 mt-4 p-1">
                                    <p className="text-sm text-muted-foreground">
                                        {t("sshPrivateKeyDisclaimer")}{" "}
                                        <Link
                                            href="https://docs.pangolin.net/"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-primary hover:underline inline-flex items-center gap-1"
                                        >
                                            {t("sshLearnMore")}
                                            <ExternalLink className="size-3.5 shrink-0" />
                                        </Link>
                                    </p>
                                    <Field
                                        label={t("username")}
                                        id="username-key"
                                    >
                                        <Input
                                            id="username-key"
                                            value={form.username}
                                            onChange={(e) =>
                                                setForm({
                                                    ...form,
                                                    username: e.target.value
                                                })
                                            }
                                        />
                                    </Field>
                                    <Field
                                        label={t("sshPrivateKeyField")}
                                        id="privateKey"
                                    >
                                        <Textarea
                                            id="privateKey"
                                            value={form.privateKey}
                                            onChange={(e) =>
                                                setForm({
                                                    ...form,
                                                    privateKey: e.target.value
                                                })
                                            }
                                            placeholder={t(
                                                "sshPrivateKeyPlaceholder"
                                            )}
                                            rows={5}
                                            className="font-mono text-xs"
                                        />
                                    </Field>
                                    <Field
                                        label={t("sshPrivateKeyFile")}
                                        id="privateKeyFile"
                                    >
                                        <Input
                                            id="privateKeyFile"
                                            type="file"
                                            accept=".pem,.key,.pub,*"
                                            onChange={handleKeyFile}
                                        />
                                    </Field>
                                    <div className="mt-4 space-y-3">
                                        {connectError && (
                                            <Alert variant="destructive">
                                                <AlertDescription>
                                                    {connectError}
                                                </AlertDescription>
                                            </Alert>
                                        )}

                                        <Button
                                            onClick={() =>
                                                connect(undefined, "privateKey")
                                            }
                                            loading={connecting}
                                            disabled={
                                                !form.username ||
                                                !form.privateKey
                                            }
                                            className="w-full"
                                        >
                                            {connecting
                                                ? t("sshConnecting")
                                                : t("sshAuthenticate")}
                                        </Button>
                                    </div>
                                </div>
                            </HorizontalTabs>
                        </CardContent>
                    </Card>
                </BrandedAuthSurface>
            )}

            {connected && (
                <div className="fixed inset-0 z-50 flex flex-col bg-neutral-900">
                    <div className="flex flex-wrap items-center gap-2 bg-black p-2 text-white">
                        <Button
                            size="sm"
                            variant="destructive"
                            onClick={disconnect}
                        >
                            {t("sshTerminate")}
                        </Button>
                    </div>
                    <div
                        ref={terminalRef}
                        className="flex-1 overflow-hidden"
                        style={{ minHeight: 0 }}
                    />
                </div>
            )}
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
