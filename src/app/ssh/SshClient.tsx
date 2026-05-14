"use client";

import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FormState = {
    hostname: string;
    port: string;
    username: string;
    password: string;
};

export default function SshClient() {
    const [form, setForm] = useState<FormState>({
        hostname: "",
        port: "22",
        username: "",
        password: ""
    });

    const [connected, setConnected] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [error, setError] = useState<string | null>(null);

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

    function connect() {
        setError(null);
        setConnecting(true);

        const proxyAddress = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/gateway/ssh`;
        const url = new URL(proxyAddress);
        // Pass connection parameters as query params so the proxy can route
        // before any application-level framing is needed.
        url.searchParams.set("host", form.hostname);
        url.searchParams.set("port", form.port);
        url.searchParams.set("username", form.username);
        // Auth token is sent as a query param; the proxy validates it before
        // forwarding any data.
        url.searchParams.set("authToken", "test-token");

        const ws = new WebSocket(url.toString(), ["ssh"]);
        wsRef.current = ws;

        ws.onopen = () => {
            // Send the password (or empty string) as the first frame so the
            // proxy can complete SSH authentication before piping pty data.
            ws.send(JSON.stringify({ type: "auth", password: form.password }));
            setConnecting(false);
            setConnected(true);
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
                        xtermRef.current?.write(msg.data);
                    } else if (msg.type === "error") {
                        xtermRef.current?.writeln(
                            `\r\n\x1b[31mError: ${msg.error}\x1b[0m\r\n`
                        );
                    }
                } catch {
                    xtermRef.current?.write(evt.data);
                }
            } else if (evt.data instanceof Blob) {
                evt.data.text().then((t) => xtermRef.current?.write(t));
            }
        };

        ws.onerror = () => {
            setConnecting(false);
            setConnected(false);
            setError("WebSocket connection failed");
        };

        ws.onclose = (evt) => {
            setConnecting(false);
            setConnected(false);
            xtermRef.current?.writeln(
                `\r\n\x1b[33mConnection closed (code ${evt.code})\x1b[0m\r\n`
            );
        };
    }

    function disconnect() {
        wsRef.current?.close();
        xtermRef.current?.dispose();
        xtermRef.current = null;
        setConnected(false);
    }

    return (
        <div className="flex flex-col h-screen bg-black text-white p-4 gap-4">
            <h1 className="text-xl font-semibold text-white">SSH Terminal</h1>

            {!connected && (
                <div className="bg-neutral-900 rounded-lg p-6 max-w-lg w-full mx-auto flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1">
                            <Label
                                htmlFor="hostname"
                                className="text-neutral-300"
                            >
                                Host
                            </Label>
                            <Input
                                id="hostname"
                                value={form.hostname}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        hostname: e.target.value
                                    })
                                }
                                placeholder="192.168.1.1"
                                className="bg-neutral-800 border-neutral-700 text-white"
                            />
                        </div>

                        <div className="flex flex-col gap-1">
                            <Label htmlFor="port" className="text-neutral-300">
                                Port
                            </Label>
                            <Input
                                id="port"
                                value={form.port}
                                onChange={(e) =>
                                    setForm({ ...form, port: e.target.value })
                                }
                                placeholder="22"
                                className="bg-neutral-800 border-neutral-700 text-white"
                            />
                        </div>

                        <div className="flex flex-col gap-1">
                            <Label
                                htmlFor="username"
                                className="text-neutral-300"
                            >
                                Username
                            </Label>
                            <Input
                                id="username"
                                value={form.username}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        username: e.target.value
                                    })
                                }
                                placeholder="root"
                                className="bg-neutral-800 border-neutral-700 text-white"
                            />
                        </div>

                        <div className="flex flex-col gap-1">
                            <Label
                                htmlFor="password"
                                className="text-neutral-300"
                            >
                                Password
                            </Label>
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
                                className="bg-neutral-800 border-neutral-700 text-white"
                            />
                        </div>
                    </div>

                    {error && <p className="text-red-400 text-sm">{error}</p>}

                    <Button
                        onClick={connect}
                        disabled={
                            connecting || !form.hostname || !form.username
                        }
                        className="w-full"
                    >
                        {connecting ? "Connecting…" : "Connect"}
                    </Button>
                </div>
            )}

            {connected && (
                <div className="flex flex-col flex-1 gap-2 min-h-0">
                    <div className="flex justify-end">
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={disconnect}
                        >
                            Disconnect
                        </Button>
                    </div>
                    <div
                        ref={terminalRef}
                        className="flex-1 rounded overflow-hidden"
                        style={{ minHeight: 0 }}
                    />
                </div>
            )}
        </div>
    );
}
