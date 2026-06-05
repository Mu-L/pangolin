"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@app/components/ui/button";
import { Input } from "@app/components/ui/input";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@app/components/ui/form";
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

type VncCredentialsForm = {
    password: string;
};

function loadStoredCredentials(key: string): VncCredentialsForm {
    try {
        const saved = localStorage.getItem(key);
        if (saved) return JSON.parse(saved) as VncCredentialsForm;
    } catch {
        // ignore
    }
    return { password: "" };
}

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
    const resourceName = target?.name?.trim() || null;

    const formSchema = z.object({
        password: z.string()
    });

    const form = useForm<VncCredentialsForm>({
        resolver: zodResolver(formSchema),
        defaultValues: loadStoredCredentials(STORAGE_KEY)
    });

    const [connected, setConnected] = useState(false);
    const [connectError, setConnectError] = useState<string | null>(null);
    const rfbRef = useRef<any>(null);
    const screenRef = useRef<HTMLDivElement>(null);

    const disconnect = () => {
        if (rfbRef.current) {
            rfbRef.current.disconnect();
            rfbRef.current = null;
        }
        setConnected(false);
    };

    useEffect(() => {
        return () => disconnect();
    }, []);

    const connect = async (values: VncCredentialsForm) => {
        if (!target) {
            setConnectError(t("vncNoResourceTarget"));
            return;
        }

        if (!screenRef.current) return;

        disconnect();

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

        const proxyAddress = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/gateway/vnc`;
        const base = proxyAddress.replace(/\/$/, "");
        const params = new URLSearchParams({
            host: target.ip,
            port: String(target.port),
            authToken: target.authToken
        });
        const wsUrl = `${base}?${params.toString()}`;

        screenRef.current.innerHTML = "";

        const options: Record<string, unknown> = {};
        if (values.password) {
            options.credentials = { password: values.password };
        }

        const rfb: any = new RFB(screenRef.current, wsUrl, options);

        rfb.scaleViewport = true;
        rfb.resizeSession = true;

        rfb.addEventListener("connect", () => {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
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

    const onSubmit = (values: VncCredentialsForm) => {
        setConnectError(null);
        connect(values);
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
                            <CardTitle>
                                {resourceName
                                    ? `${t("vncTitle")} - ${resourceName}`
                                    : t("vncTitle")}
                            </CardTitle>
                            <CardDescription>
                                {resourceName
                                    ? `${t("vncSignInDescription")} (${resourceName})`
                                    : t("vncSignInDescription")}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Form {...form}>
                                <form
                                    onSubmit={form.handleSubmit(onSubmit)}
                                    className="space-y-4"
                                >
                                    <FormField
                                        control={form.control}
                                        name="password"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>
                                                    {t("vncPasswordOptional")}
                                                </FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="password"
                                                        {...field}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <Button type="submit" className="w-full">
                                        {t("browserGatewayConnect")}
                                    </Button>
                                    {connectError && (
                                        <Alert variant="destructive">
                                            <AlertDescription>
                                                {connectError}
                                            </AlertDescription>
                                        </Alert>
                                    )}
                                </form>
                            </Form>
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

                <div
                    ref={screenRef}
                    className="flex-1 overflow-hidden"
                    style={{ background: "#000" }}
                />
            </div>
        </>
    );
}
