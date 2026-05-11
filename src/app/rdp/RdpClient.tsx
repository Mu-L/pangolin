"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@app/hooks/useToast";
import type {
    UserInteraction,
    IronError
} from "@devolutions/iron-remote-desktop/dist";

declare module "react" {
    namespace JSX {
        interface IntrinsicElements {
            "iron-remote-desktop": React.DetailedHTMLProps<
                React.HTMLAttributes<HTMLElement> & {
                    scale?: string;
                    verbose?: string;
                    flexcenter?: string;
                    module?: unknown;
                },
                HTMLElement
            >;
        }
    }
}

type FormState = {
    username: string;
    password: string;
    gatewayAddress: string;
    hostname: string;
    domain: string;
    authtoken: string;
    kdcProxyUrl: string;
    pcb: string;
    desktopWidth: number;
    desktopHeight: number;
    enableClipboard: boolean;
};

const isIronError = (error: unknown): error is IronError => {
    return (
        typeof error === "object" &&
        error !== null &&
        typeof (error as IronError).backtrace === "function" &&
        typeof (error as IronError).kind === "function"
    );
};

export default function RdpClient() {
    const [form, setForm] = useState<FormState>({
        username: "Administrator",
        password: "Wdvwy1W*ITK-(OK.sW?nVK%?mTl30wL0",
        gatewayAddress: "ws://localhost:7171/jet/rdp",
        hostname: "172.31.3.58:3389",
        domain: "",
        authtoken: "abc123",
        kdcProxyUrl: "",
        pcb: "",
        desktopWidth: 1280,
        desktopHeight: 720,
        enableClipboard: true
    });

    const [showLogin, setShowLogin] = useState(true);
    const [moduleReady, setModuleReady] = useState(false);
    const [unicodeMode, setUnicodeMode] = useState(false);
    const [cursorOverrideActive, setCursorOverrideActive] = useState(false);

    const userInteractionRef = useRef<UserInteraction | null>(null);
    const backendRef = useRef<unknown>(null);
    const extensionsRef = useRef<{
        displayControl: (enable: boolean) => unknown;
        preConnectionBlob: (pcb: string) => unknown;
        kdcProxyUrl: (url: string) => unknown;
    } | null>(null);

    // Load the iron-remote-desktop modules client-side and register the
    // `<iron-remote-desktop>` custom element.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const [coreMod, rdpMod] = await Promise.all([
                import("@devolutions/iron-remote-desktop/dist"),
                import("@devolutions/iron-remote-desktop-rdp/dist")
            ]);
            if (cancelled) return;

            await rdpMod.init("INFO");

            backendRef.current = rdpMod.Backend;
            extensionsRef.current = {
                displayControl: rdpMod.displayControl,
                preConnectionBlob: rdpMod.preConnectionBlob,
                kdcProxyUrl: rdpMod.kdcProxyUrl
            };
            // Importing the package registers the custom element as a side
            // effect. Touch the default export to avoid tree-shaking.
            void coreMod;

            setModuleReady(true);
        })().catch((err) => {
            console.error("Failed to load iron-remote-desktop modules", err);
            toast({
                variant: "destructive",
                title: "Failed to load RDP module",
                description: `${err}`
            });
        });

        return () => {
            cancelled = true;
        };
    }, []);

    // Attach the "ready" listener synchronously the moment the custom
    // element mounts. The custom element dispatches `ready` from its own
    // `onMount`, so a deferred useEffect can race and miss it.
    const remoteElementRef = (el: HTMLElement | null) => {
        if (!el) return;
        const onReady = (e: Event) => {
            const event = e as CustomEvent;
            userInteractionRef.current = event.detail.irgUserInteraction;
        };
        el.addEventListener("ready", onReady);
    };

    const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    const startSession = async () => {
        const userInteraction = userInteractionRef.current;
        const exts = extensionsRef.current;
        if (!userInteraction || !exts) {
            toast({
                variant: "destructive",
                title: "Not ready",
                description: "RDP module is still initializing"
            });
            return;
        }

        if (form.authtoken === "") {
            toast({
                variant: "destructive",
                title: "Missing auth token",
                description:
                    "An auth token is required to connect through the gateway"
            });
            return;
        }

        toast({
            title: "Connecting...",
            description: "Connection in progress"
        });

        userInteraction.setEnableClipboard(form.enableClipboard);

        const builder = userInteraction
            .configBuilder()
            .withUsername(form.username)
            .withPassword(form.password)
            .withDestination(form.hostname)
            .withProxyAddress(form.gatewayAddress)
            .withServerDomain(form.domain)
            .withAuthToken(form.authtoken)
            .withDesktopSize({
                width: form.desktopWidth,
                height: form.desktopHeight
            })
            .withExtension(exts.displayControl(true));

        if (form.pcb !== "") {
            builder.withExtension(exts.preConnectionBlob(form.pcb));
        }
        if (form.kdcProxyUrl !== "") {
            builder.withExtension(exts.kdcProxyUrl(form.kdcProxyUrl));
        }

        try {
            const sessionInfo = await userInteraction.connect(builder.build());

            toast({ title: "Connected" });
            setShowLogin(false);
            userInteraction.setVisibility(true);

            const termInfo = await sessionInfo.run();
            toast({
                title: "Session terminated",
                description: termInfo.reason()
            });
            setShowLogin(true);
        } catch (err) {
            setShowLogin(true);
            if (isIronError(err)) {
                toast({
                    variant: "destructive",
                    title: "Connection failed",
                    description: err.backtrace()
                });
            } else {
                toast({
                    variant: "destructive",
                    title: "Connection failed",
                    description: `${err}`
                });
            }
        }
    };

    const ui = () => userInteractionRef.current;

    const toggleCursorKind = () => {
        const u = ui();
        if (!u) return;
        if (cursorOverrideActive) {
            u.setCursorStyleOverride(null);
        } else {
            u.setCursorStyleOverride('url("crosshair.png") 7 7, default');
        }
        setCursorOverrideActive((v) => !v);
    };

    return (
        <div className="min-h-screen bg-background">
            {showLogin && (
                <div className="mx-auto max-w-2xl p-6">
                    <h1 className="mb-4 text-2xl font-semibold">
                        RDP Test Connection
                    </h1>

                    <div className="space-y-4">
                        <Field label="Hostname" id="hostname">
                            <Input
                                id="hostname"
                                value={form.hostname}
                                onChange={(e) =>
                                    update("hostname", e.target.value)
                                }
                            />
                        </Field>
                        <Field label="Domain" id="domain">
                            <Input
                                id="domain"
                                value={form.domain}
                                onChange={(e) =>
                                    update("domain", e.target.value)
                                }
                            />
                        </Field>
                        <Field label="Username" id="username">
                            <Input
                                id="username"
                                value={form.username}
                                onChange={(e) =>
                                    update("username", e.target.value)
                                }
                            />
                        </Field>
                        <Field label="Password" id="password">
                            <Input
                                id="password"
                                type="password"
                                value={form.password}
                                onChange={(e) =>
                                    update("password", e.target.value)
                                }
                            />
                        </Field>
                        <Field label="Gateway Address" id="gatewayAddress">
                            <Input
                                id="gatewayAddress"
                                value={form.gatewayAddress}
                                onChange={(e) =>
                                    update("gatewayAddress", e.target.value)
                                }
                            />
                        </Field>
                        {/* <Field label="Auth Token" id="authtoken">
                            <Input
                                id="authtoken"
                                value={form.authtoken}
                                onChange={(e) =>
                                    update("authtoken", e.target.value)
                                }
                            />
                        </Field>
                        <Field label="Pre Connection Blob (optional)" id="pcb">
                            <Input
                                id="pcb"
                                value={form.pcb}
                                onChange={(e) => update("pcb", e.target.value)}
                            />
                        </Field> */}
                        <div className="grid grid-cols-2 gap-4">
                            <Field label="Desktop Width" id="desktopWidth">
                                <Input
                                    id="desktopWidth"
                                    type="number"
                                    value={form.desktopWidth}
                                    onChange={(e) =>
                                        update(
                                            "desktopWidth",
                                            Number(e.target.value) || 0
                                        )
                                    }
                                />
                            </Field>
                            <Field label="Desktop Height" id="desktopHeight">
                                <Input
                                    id="desktopHeight"
                                    type="number"
                                    value={form.desktopHeight}
                                    onChange={(e) =>
                                        update(
                                            "desktopHeight",
                                            Number(e.target.value) || 0
                                        )
                                    }
                                />
                            </Field>
                        </div>
                        {/* <Field
                            label="KDC Proxy URL (optional)"
                            id="kdcProxyUrl"
                        >
                            <Input
                                id="kdcProxyUrl"
                                value={form.kdcProxyUrl}
                                onChange={(e) =>
                                    update("kdcProxyUrl", e.target.value)
                                }
                            />
                        </Field> */}
                        <div className="flex items-center gap-2">
                            <Checkbox
                                id="enable_clipboard"
                                checked={form.enableClipboard}
                                onCheckedChange={(checked) =>
                                    update("enableClipboard", checked === true)
                                }
                            />
                            <Label htmlFor="enable_clipboard">
                                Enable Clipboard
                            </Label>
                        </div>

                        <Button
                            onClick={startSession}
                            disabled={!moduleReady}
                            className="w-full"
                        >
                            {moduleReady ? "Connect" : "Loading module..."}
                        </Button>
                    </div>
                </div>
            )}

            <div
                className="flex h-screen flex-col bg-neutral-900"
                style={{ display: showLogin ? "none" : "flex" }}
            >
                <div className="flex flex-wrap items-center gap-2 bg-black p-2 text-white">
                    <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => ui()?.setScale(1)}
                    >
                        Fit
                    </Button>
                    <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => ui()?.setScale(2)}
                    >
                        Full
                    </Button>
                    <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => ui()?.setScale(3)}
                    >
                        Real
                    </Button>
                    <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => ui()?.ctrlAltDel()}
                    >
                        Ctrl+Alt+Del
                    </Button>
                    <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => ui()?.metaKey()}
                    >
                        Meta
                    </Button>
                    <Button
                        size="sm"
                        variant="secondary"
                        onClick={toggleCursorKind}
                    >
                        Toggle cursor
                    </Button>
                    <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                            ui()?.shutdown();
                            setShowLogin(true);
                        }}
                    >
                        Terminate
                    </Button>
                    <label className="ml-2 flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={unicodeMode}
                            onChange={(e) => {
                                setUnicodeMode(e.target.checked);
                                ui()?.setKeyboardUnicodeMode(e.target.checked);
                            }}
                        />
                        Unicode keyboard mode
                    </label>
                </div>

                {moduleReady && (
                    <iron-remote-desktop
                        ref={remoteElementRef}
                        verbose="true"
                        scale="fit"
                        flexcenter="true"
                        module={backendRef.current}
                    />
                )}
            </div>
        </div>
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
