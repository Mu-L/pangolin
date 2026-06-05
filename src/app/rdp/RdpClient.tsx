"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@app/hooks/useToast";
import type {
    UserInteraction,
    IronError,
    FileTransferProvider
} from "@devolutions/iron-remote-desktop/dist";
import type {
    RdpFileTransferProvider,
    FileInfo
} from "@devolutions/iron-remote-desktop-rdp/dist";
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
    domain: string;
    kdcProxyUrl: string;
    pcb: string;
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

export default function RdpClient({
    target,
    error,
    primaryColor
}: {
    target: GetBrowserTargetResponse | null;
    error: string | null;
    primaryColor?: string | null;
}) {
    const t = useTranslations();
    const STORAGE_KEY = "pangolin_rdp_credentials";

    const [form, setForm] = useState<FormState>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) return JSON.parse(saved) as FormState;
        } catch {
            // ignore
        }
        return {
            username: "",
            password: "",
            domain: "",
            kdcProxyUrl: "",
            pcb: "",
            enableClipboard: true
        };
    });

    const [showLogin, setShowLogin] = useState(true);
    const [moduleReady, setModuleReady] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [unicodeMode, setUnicodeMode] = useState(false);
    const [cursorOverrideActive, setCursorOverrideActive] = useState(false);

    const userInteractionRef = useRef<UserInteraction | null>(null);
    const backendRef = useRef<unknown>(null);
    // Holds the RdpFileTransferProvider constructor so we can create a fresh
    // instance per session (avoids stale upload state across reconnects).
    const fileTransferClassRef = useRef<typeof RdpFileTransferProvider | null>(
        null
    );
    // Active session's provider instance; replaced on each connect.
    const fileTransferRef = useRef<RdpFileTransferProvider | null>(null);
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

            // Store the class; a fresh instance is created per session.
            fileTransferClassRef.current =
                rdpMod.RdpFileTransferProvider as unknown as typeof RdpFileTransferProvider;

            // Importing the package registers the custom element as a side
            // effect. Touch the default export to avoid tree-shaking.
            void coreMod;

            setModuleReady(true);
        })().catch((err) => {
            console.error("Failed to load iron-remote-desktop modules", err);
            toast({
                variant: "destructive",
                title: t("rdpFailedToLoadModule"),
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
        setSubmitError(null);
        setConnecting(true);
        const userInteraction = userInteractionRef.current;
        const exts = extensionsRef.current;
        if (!userInteraction || !exts) {
            setConnecting(false);
            setSubmitError(t("rdpModuleInitializing"));
            return;
        }

        userInteraction.setEnableClipboard(form.enableClipboard);

        // Dispose any previous session's provider and create a fresh one so
        // there is no stale upload state from a prior connection.
        fileTransferRef.current?.dispose();
        const ProviderClass = fileTransferClassRef.current;
        const fileTransfer = ProviderClass ? new ProviderClass() : null;
        fileTransferRef.current = fileTransfer;

        if (fileTransfer) {
            // Auto-download files when the remote copies them to clipboard.
            fileTransfer.on("files-available", (files: FileInfo[]) => {
                const downloadable = files.filter((f) => !f.isDirectory);
                if (downloadable.length === 0) return;
                toast({
                    title: t("rdpDownloadingFiles", {
                        count: downloadable.length
                    })
                });
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    if (file.isDirectory) continue;
                    const { completion } = fileTransfer.downloadFile(file, i);
                    completion
                        .then((blob) => {
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = file.name;
                            a.click();
                            URL.revokeObjectURL(url);
                        })
                        .catch((err) => {
                            toast({
                                variant: "destructive",
                                title: t("rdpDownloadFailed", {
                                    fileName: file.name
                                }),
                                description: `${err}`
                            });
                        });
                }
            });

            // Notify when individual uploads complete (remote pasted a file).
            fileTransfer.on("upload-complete", (file: File) => {
                toast({ title: t("rdpUploaded", { fileName: file.name }) });
            });

            // Register with the web component so CLIPRDR extensions are
            // wired up before connect() builds the session.
            userInteraction.enableFileTransfer(
                fileTransfer as unknown as FileTransferProvider
            );
        }

        if (!target) {
            setConnecting(false);
            setSubmitError(t("rdpNoConnectionTarget"));
            return;
        }

        const destination = `${target.ip}:${target.port}`;

        const builder = userInteraction
            .configBuilder()
            .withUsername(form.username)
            .withPassword(form.password)
            .withDestination(destination)
            .withProxyAddress(
                `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/gateway/rdp`
            )
            .withServerDomain(form.domain)
            .withAuthToken(target.authToken)
            .withDesktopSize({
                width: window.innerWidth,
                height: window.innerHeight
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

            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
            } catch {
                // ignore
            }
            setConnecting(false);
            setShowLogin(false);
            userInteraction.setVisibility(true);

            const termInfo = await sessionInfo.run();
            fileTransferRef.current?.dispose();
            fileTransferRef.current = null;
            setShowLogin(true);
        } catch (err) {
            setConnecting(false);
            setShowLogin(true);
            if (isIronError(err)) {
                setSubmitError(err.backtrace());
            } else {
                setSubmitError(`${err}`);
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

    if (error) {
        return (
            <BrandedAuthSurface primaryColor={primaryColor}>
                <PoweredByPangolin />
                <Card className="w-full">
                    <CardHeader>
                        <CardTitle>{t("rdpTitle")}</CardTitle>
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
            {showLogin && (
                <BrandedAuthSurface primaryColor={primaryColor}>
                    <PoweredByPangolin />
                    <Card className="w-full">
                        <CardHeader>
                            <CardTitle>{t("rdpSignInTitle")}</CardTitle>
                            <CardDescription>
                                {t("rdpSignInDescription")}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <Field label={t("domain")} id="domain">
                                    <Input
                                        id="domain"
                                        value={form.domain}
                                        onChange={(e) =>
                                            update("domain", e.target.value)
                                        }
                                    />
                                </Field>
                                <Field label={t("username")} id="username">
                                    <Input
                                        id="username"
                                        value={form.username}
                                        onChange={(e) =>
                                            update("username", e.target.value)
                                        }
                                    />
                                </Field>
                                <Field label={t("password")} id="password">
                                    <Input
                                        id="password"
                                        type="password"
                                        value={form.password}
                                        onChange={(e) =>
                                            update("password", e.target.value)
                                        }
                                    />
                                </Field>
                                {/* 
                        <Field label="Pre Connection Blob (optional)" id="pcb">
                            <Input
                                id="pcb"
                                value={form.pcb}
                                onChange={(e) => update("pcb", e.target.value)}
                            />
                        </Field> */}

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
                                {/* <div className="flex items-center gap-2">
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
                        </div> */}
                                {submitError && (
                                    <Alert variant="destructive">
                                        <AlertDescription>
                                            {submitError}
                                        </AlertDescription>
                                    </Alert>
                                )}

                                <Button
                                    onClick={startSession}
                                    disabled={!moduleReady}
                                    loading={connecting}
                                    className="w-full"
                                >
                                    {moduleReady
                                        ? t("browserGatewayConnect")
                                        : t("rdpLoadingModule")}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </BrandedAuthSurface>
            )}

            <div
                className="fixed inset-0 z-50 flex flex-col bg-neutral-900"
                style={{ display: showLogin ? "none" : "flex" }}
            >
                <div className="flex flex-wrap items-center gap-2 bg-black p-2 text-white">
                    <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => ui()?.setScale(1)}
                    >
                        {t("rdpFit")}
                    </Button>
                    <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => ui()?.setScale(2)}
                    >
                        {t("rdpFull")}
                    </Button>
                    <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => ui()?.setScale(3)}
                    >
                        {t("rdpReal")}
                    </Button>
                    <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => ui()?.ctrlAltDel()}
                    >
                        {t("browserGatewayCtrlAltDel")}
                    </Button>
                    <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => ui()?.metaKey()}
                    >
                        {t("rdpMeta")}
                    </Button>
                    {/* <Button
                        size="sm"
                        variant="secondary"
                        onClick={toggleCursorKind}
                    >
                        Toggle cursor
                    </Button> */}
                    <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                            const ft = fileTransferRef.current;
                            if (!ft) return;
                            const files = await ft.showFilePicker({
                                multiple: true
                            });
                            if (files.length === 0) return;
                            try {
                                ft.uploadFiles(files);
                                toast({
                                    title: t("rdpFilesReadyToPaste"),
                                    description: t(
                                        "rdpFilesReadyToPasteDescription",
                                        { count: files.length }
                                    )
                                });
                            } catch (err) {
                                toast({
                                    variant: "destructive",
                                    title: t("rdpUploadFailed"),
                                    description: `${err}`
                                });
                            }
                        }}
                    >
                        {t("rdpUploadFiles")}
                    </Button>
                    <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                            ui()?.shutdown();
                            setShowLogin(true);
                        }}
                    >
                        {t("sshTerminate")}
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
                        {t("rdpUnicodeKeyboardMode")}
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
