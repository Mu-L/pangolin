"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useRouter } from "next/navigation";
import {
    InputOTP,
    InputOTPGroup,
    InputOTPSeparator,
    InputOTPSlot
} from "@/components/ui/input-otp";
import { REGEXP_ONLY_DIGITS_AND_CHARS } from "input-otp";
import { AlertTriangle } from "lucide-react";
import { DeviceAuthConfirmation } from "@/components/DeviceAuthConfirmation";
import { useLicenseStatusContext } from "@app/hooks/useLicenseStatusContext";
import BrandingLogo from "./BrandingLogo";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const createFormSchema = (t: (key: string) => string) =>
    z.object({
        code: z.string().length(8, t("deviceCodeInvalidFormat"))
    });

type DeviceAuthMetadata = {
    ip: string | null;
    city: string | null;
    deviceName: string | null;
    applicationName: string;
    createdAt: number;
};

type DeviceLoginFormProps = {
    userEmail: string;
    userName?: string;
    initialCode?: string;
};

export default function DeviceLoginForm({
    userEmail,
    userName,
    initialCode = ""
}: DeviceLoginFormProps) {
    const router = useRouter();
    const { env } = useEnvContext();
    const api = createApiClient({ env });
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [metadata, setMetadata] = useState<DeviceAuthMetadata | null>(null);
    const [code, setCode] = useState<string>("");
    const { isUnlocked } = useLicenseStatusContext();
    const t = useTranslations();

    const formSchema = createFormSchema(t);

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            code: initialCode.replace(/-/g, "").toUpperCase()
        }
    });

    async function onSubmit(data: z.infer<typeof formSchema>) {
        setError(null);
        setLoading(true);

        try {
            // split code and add dash if missing
            if (!data.code.includes("-") && data.code.length === 8) {
                data.code = data.code.slice(0, 4) + "-" + data.code.slice(4);
            }

            // First check - get metadata
            const res = await api.post(
                "/device-web-auth/verify?forceLogin=true",
                {
                    code: data.code.toUpperCase(),
                    verify: false
                }
            );

            if (res.data.success && res.data.data.metadata) {
                setMetadata(res.data.data.metadata);
                setCode(data.code.toUpperCase());
            } else {
                setError(t("deviceCodeInvalidOrExpired"));
            }
        } catch (e: any) {
            const errorMessage = formatAxiosError(e);
            setError(errorMessage || t("deviceCodeInvalidOrExpired"));
        } finally {
            setLoading(false);
        }
    }

    async function onConfirm() {
        if (!code || !metadata) return;

        setError(null);
        setLoading(true);

        try {
            // Final verify
            await api.post("/device-web-auth/verify", {
                code: code,
                verify: true
            });

            // Redirect to success page
            router.push("/auth/login/device/success");
        } catch (e: any) {
            const errorMessage = formatAxiosError(e);
            setError(errorMessage || t("deviceCodeVerifyFailed"));
            setMetadata(null);
            setCode("");
            form.reset();
        } finally {
            setLoading(false);
        }
    }

    const logoWidth = isUnlocked()
        ? env.branding.logo?.authPage?.width || 175
        : 175;
    const logoHeight = isUnlocked()
        ? env.branding.logo?.authPage?.height || 58
        : 58;

    function onCancel() {
        setMetadata(null);
        setCode("");
        form.reset();
        setError(null);
    }

    const profileLabel = (userName || userEmail || "").trim();
    const profileInitial = profileLabel
        ? profileLabel.charAt(0).toUpperCase()
        : "?";

    async function handleUseDifferentAccount() {
        try {
            await api.post("/auth/logout");
        } catch (logoutError) {
            console.error(
                "Failed to logout before switching account",
                logoutError
            );
        } finally {
            const currentSearch =
                typeof window !== "undefined" ? window.location.search : "";
            const redirectTarget = `/auth/login/device${currentSearch || ""}`;
            router.push(
                `/auth/login?forceLogin=true&redirect=${encodeURIComponent(redirectTarget)}`
            );
            router.refresh();
        }
    }

    if (metadata) {
        return (
            <DeviceAuthConfirmation
                metadata={metadata}
                onConfirm={onConfirm}
                onCancel={onCancel}
                loading={loading}
            />
        );
    }

    return (
        <Card className="w-full max-w-md">
            <CardHeader className="border-b">
                <div className="flex flex-row items-center justify-center">
                    <BrandingLogo height={logoHeight} width={logoWidth} />
                </div>
                <div className="text-center space-y-1 pt-3">
                    <p className="text-muted-foreground">
                        {t("deviceActivation")}
                    </p>
                </div>
            </CardHeader>
            <CardContent className="pt-6">
                <div className="flex items-center gap-3 p-3 mb-4 border rounded-md">
                    <Avatar className="h-10 w-10">
                        <AvatarFallback>{profileInitial}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-1">
                        <div>
                            <p className="text-sm font-medium">
                                {profileLabel || userEmail}
                            </p>
                            <p className="text-xs text-muted-foreground break-all">
                                {t(
                                    "deviceLoginDeviceRequestingAccessToAccount"
                                )}
                            </p>
                        </div>
                        <Button
                            type="button"
                            variant="link"
                            className="h-auto px-0 text-xs"
                            onClick={handleUseDifferentAccount}
                        >
                            {t("deviceLoginUseDifferentAccount")}
                        </Button>
                    </div>
                </div>

                <Form {...form}>
                    <form
                        onSubmit={form.handleSubmit(onSubmit)}
                        className="space-y-4"
                    >
                        <div className="space-y-2">
                            <p className="text-sm text-muted-foreground text-center">
                                {t("deviceCodeEnterPrompt")}
                            </p>
                        </div>

                        <FormField
                            control={form.control}
                            name="code"
                            render={({ field }) => (
                                <FormItem>
                                    <FormControl>
                                        <div className="flex justify-center">
                                            <InputOTP
                                                maxLength={9}
                                                {...field}
                                                value={field.value
                                                    .replace(/-/g, "")
                                                    .toUpperCase()}
                                                onChange={(value) => {
                                                    // Strip hyphens and convert to uppercase
                                                    const cleanedValue = value
                                                        .replace(/-/g, "")
                                                        .toUpperCase();
                                                    field.onChange(
                                                        cleanedValue
                                                    );
                                                }}
                                            >
                                                <InputOTPGroup>
                                                    <InputOTPSlot index={0} />
                                                    <InputOTPSlot index={1} />
                                                    <InputOTPSlot index={2} />
                                                    <InputOTPSlot index={3} />
                                                </InputOTPGroup>
                                                <InputOTPSeparator />
                                                <InputOTPGroup>
                                                    <InputOTPSlot index={4} />
                                                    <InputOTPSlot index={5} />
                                                    <InputOTPSlot index={6} />
                                                    <InputOTPSlot index={7} />
                                                </InputOTPGroup>
                                            </InputOTP>
                                        </div>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {error && (
                            <Alert variant="destructive">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        <Button
                            type="submit"
                            className="w-full"
                            disabled={loading}
                            loading={loading}
                        >
                            {t("continue")}
                        </Button>
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}
