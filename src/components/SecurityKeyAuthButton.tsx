"use client";

import { useState } from "react";
import { Button } from "@app/components/ui/button";
import { FingerprintIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { startAuthentication } from "@simplewebauthn/browser";
import {
    securityKeyStartProxy,
    securityKeyVerifyProxy
} from "@app/actions/server";
import { useRouter } from "next/navigation";
import { cleanRedirect } from "@app/lib/cleanRedirect";

type SecurityKeyAuthButtonProps = {
    redirect?: string;
    forceLogin?: boolean;
    onSuccess?: (redirectUrl?: string) => void | Promise<void>;
    onError?: (error: string) => void;
    disabled?: boolean;
    className?: string;
};

export default function SecurityKeyAuthButton({
    redirect,
    forceLogin,
    onSuccess,
    onError,
    disabled: externalDisabled,
    className
}: SecurityKeyAuthButtonProps) {
    const router = useRouter();
    const t = useTranslations();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function initiateSecurityKeyAuth() {
        setLoading(true);
        setError(null);

        try {
            // Start WebAuthn authentication without email
            const startResponse = await securityKeyStartProxy({}, forceLogin);

            if (startResponse.error) {
                const errorMessage = startResponse.message;
                setError(errorMessage);
                if (onError) {
                    onError(errorMessage);
                }
                setLoading(false);
                return;
            }

            const { tempSessionId, ...options } = startResponse.data!;

            // Perform WebAuthn authentication
            try {
                const credential = await startAuthentication({
                    optionsJSON: {
                        ...options,
                        userVerification: options.userVerification as
                            | "required"
                            | "preferred"
                            | "discouraged"
                    }
                });

                // Verify authentication
                const verifyResponse = await securityKeyVerifyProxy(
                    { credential },
                    tempSessionId,
                    forceLogin
                );

                if (verifyResponse.error) {
                    const errorMessage = verifyResponse.message;
                    setError(errorMessage);
                    if (onError) {
                        onError(errorMessage);
                    }
                    setLoading(false);
                    return;
                }

                if (verifyResponse.success) {
                    if (onSuccess) {
                        await onSuccess(redirect);
                    } else {
                        // Default behavior: redirect
                        if (redirect) {
                            const safe = cleanRedirect(redirect);
                            router.replace(safe);
                        } else {
                            router.replace("/");
                        }
                    }
                }
            } catch (error: any) {
                let errorMessage: string;
                if (error.name === "NotAllowedError") {
                    if (error.message.includes("denied permission")) {
                        errorMessage = t("securityKeyPermissionDenied", {
                            defaultValue:
                                "Please allow access to your security key to continue signing in."
                        });
                    } else {
                        errorMessage = t("securityKeyRemovedTooQuickly", {
                            defaultValue:
                                "Please keep your security key connected until the sign-in process completes."
                        });
                    }
                } else if (error.name === "NotSupportedError") {
                    errorMessage = t("securityKeyNotSupported", {
                        defaultValue:
                            "Your security key may not be compatible. Please try a different security key."
                    });
                } else {
                    errorMessage = t("securityKeyUnknownError", {
                        defaultValue:
                            "There was a problem using your security key. Please try again."
                    });
                }
                setError(errorMessage);
                if (onError) {
                    onError(errorMessage);
                }
                setLoading(false);
            }
        } catch (e: any) {
            console.error(e);
            const errorMessage = t("securityKeyAuthError", {
                defaultValue:
                    "An unexpected error occurred. Please try again."
            });
            setError(errorMessage);
            if (onError) {
                onError(errorMessage);
            }
            setLoading(false);
        }
    }

    return (
        <Button
            type="button"
            variant="outline"
            className={className || "w-full"}
            onClick={initiateSecurityKeyAuth}
            disabled={externalDisabled || loading}
            loading={loading}
        >
            <FingerprintIcon className="w-4 h-4 mr-2" />
            {t("securityKeyLogin")}
        </Button>
    );
}
