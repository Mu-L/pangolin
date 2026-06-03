"use client";

import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SignSshKeyResponse } from "@server/private/routers/ssh";
import { GetBrowserTargetResponse } from "@server/routers/browserGatewayTarget";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription
} from "@app/components/ui/card";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { cn } from "@app/lib/cn";

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
    privateKey: signedPrivateKey
}: {
    target: GetBrowserTargetResponse | null;
    error: string | null;
    signedKeyData?: SignSshKeyResponse | null;
    privateKey?: string | null;
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

    const [authTab, setAuthTab] = useState<AuthTab>("password");

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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function connect(override?: ConnectCredentials) {
        setConnectError(null);
        setConnecting(true);

        if (!target) {
            setConnectError("No target specified");
            setConnecting(false);
            return;
        }

        const username = override?.username ?? form.username;
        const password =
            override?.password ?? (authTab === "password" ? form.password : "");
        const privateKey =
            override?.privateKey ??
            (authTab === "privateKey" ? form.privateKey : "");
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
            // state until the server responds — this prevents the flash to the
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
                            // Auth-phase error — show in the login form.
                            authErrorShown = true;
                            setConnecting(false);
                            setConnectError(
                                msg.error ?? "Authentication failed"
                            );
                        } else {
                            xtermRef.current?.writeln(
                                `\r\n\x1b[31mError: ${msg.error}\x1b[0m\r\n`
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
                evt.data.text().then((t) => {
                    if (!authConfirmed) {
                        authConfirmed = true;
                        setConnecting(false);
                        setConnected(true);
                    }
                    xtermRef.current?.write(t);
                });
            }
        };

        ws.onerror = () => {
            setConnecting(false);
            setConnected(false);
            setConnectError("WebSocket connection failed");
        };

        ws.onclose = (evt) => {
            setConnecting(false);
            if (authConfirmed) {
                setConnected(false);
                xtermRef.current?.writeln(
                    `\r\n\x1b[33mConnection closed (code ${evt.code})\x1b[0m\r\n`
                );
            }
            // If auth was never confirmed the login form is already visible;
            // a generic error is shown only when no specific error was received.
            if (!authConfirmed && !authErrorShown) {
                setConnectError(
                    "Connection closed before authentication completed"
                );
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
                    <div className="flex items-center justify-center py-12">
                        <p className="text-muted-foreground">
                            {connectError
                                ? connectError
                                : connecting
                                  ? "Connecting…"
                                  : "Initializing…"}
                        </p>
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
            <div>
                <div className="text-center mb-2">
                    <span className="text-sm text-muted-foreground">
                        Powered by{" "}
                        <Link
                            href="https://pangolin.net/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline"
                        >
                            Pangolin
                        </Link>
                    </span>
                </div>
                <Card className="w-full">
                    <CardHeader>
                        <CardTitle>SSH</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-destructive text-sm">{error}</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <>
            {!connected && (
                <div>
                    <div className="text-center mb-2">
                        <span className="text-sm text-muted-foreground">
                            Powered by{" "}
                            <Link
                                href="https://pangolin.net/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline"
                            >
                                Pangolin
                            </Link>
                        </span>
                    </div>
                    <Card className="w-full">
                        <CardHeader>
                            <CardTitle>Sign in to SSH</CardTitle>
                            <CardDescription>
                                Enter credentials to access xxxx
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {/* Tab row */}
                            <div className="flex space-x-4 border-b mb-4">
                                {(["password", "privateKey"] as const).map(
                                    (tab) => (
                                        <button
                                            key={tab}
                                            type="button"
                                            onClick={() => setAuthTab(tab)}
                                            className={cn(
                                                "px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap relative",
                                                authTab === tab
                                                    ? "text-primary after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary after:rounded-full"
                                                    : "text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            {tab === "password"
                                                ? "Password"
                                                : "Private Key"}
                                        </button>
                                    )
                                )}
                            </div>

                            {authTab === "password" && (
                                <div className="space-y-4">
                                    <Field label="Username" id="username-pw">
                                        <Input
                                            id="username-pw"
                                            value={form.username}
                                            onChange={(e) =>
                                                setForm({
                                                    ...form,
                                                    username: e.target.value
                                                })
                                            }
                                            placeholder="root"
                                        />
                                    </Field>
                                    <Field label="Password" id="password">
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
                                </div>
                            )}

                            {authTab === "privateKey" && (
                                <div className="space-y-4">
                                    <p className="text-sm text-muted-foreground">
                                        Your private key is not stored or
                                        visible to Pangolin. Alternatively, you
                                        can use short-lived certificates for
                                        seamless authentication using your
                                        existing Pangolin identity.{" "}
                                        <Link
                                            href="https://docs.pangolin.net/"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="underline inline-flex items-center gap-1"
                                        >
                                            Learn more
                                            <ExternalLink className="h-3 w-3" />
                                        </Link>
                                    </p>
                                    <Field label="Username" id="username-key">
                                        <Input
                                            id="username-key"
                                            value={form.username}
                                            onChange={(e) =>
                                                setForm({
                                                    ...form,
                                                    username: e.target.value
                                                })
                                            }
                                            placeholder="root"
                                        />
                                    </Field>
                                    <Field label="Private Key" id="privateKey">
                                        <Textarea
                                            id="privateKey"
                                            value={form.privateKey}
                                            onChange={(e) =>
                                                setForm({
                                                    ...form,
                                                    privateKey: e.target.value
                                                })
                                            }
                                            placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                                            rows={5}
                                            className="font-mono text-xs"
                                        />
                                    </Field>
                                    <Field
                                        label="Private Key File"
                                        id="privateKeyFile"
                                    >
                                        <Input
                                            id="privateKeyFile"
                                            type="file"
                                            accept=".pem,.key,.pub,*"
                                            onChange={handleKeyFile}
                                        />
                                    </Field>
                                </div>
                            )}

                            <div className="mt-4 space-y-3">
                                {connectError && (
                                    <p className="text-destructive text-sm">
                                        {connectError}
                                    </p>
                                )}

                                <Button
                                    onClick={() => connect()}
                                    loading={connecting}
                                    disabled={
                                        !form.username ||
                                        (authTab === "password"
                                            ? !form.password
                                            : !form.privateKey)
                                    }
                                    className="w-full"
                                >
                                    {connecting
                                        ? "Connecting..."
                                        : "Authenticate"}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {connected && (
                <div className="fixed inset-0 z-50 flex flex-col bg-neutral-900">
                    <div className="flex flex-wrap items-center gap-2 bg-black p-2 text-white">
                        <Button
                            size="sm"
                            variant="destructive"
                            onClick={disconnect}
                        >
                            Terminate
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
