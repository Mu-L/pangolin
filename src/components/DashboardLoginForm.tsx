"use client";

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card";
import { createApiClient } from "@app/lib/api";
import LoginForm, { LoginFormIDP } from "@app/components/LoginForm";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Image from "next/image";
import { cleanRedirect } from "@app/lib/cleanRedirect";
import BrandingLogo from "@app/components/BrandingLogo";
import { useTranslations } from "next-intl";
import { useLicenseStatusContext } from "@app/hooks/useLicenseStatusContext";
import { build } from "@server/build";

type DashboardLoginFormProps = {
    redirect?: string;
    idps?: LoginFormIDP[];
    forceLogin?: boolean;
};

export default function DashboardLoginForm({
    redirect,
    idps,
    forceLogin
}: DashboardLoginFormProps) {
    const router = useRouter();
    const { env } = useEnvContext();
    const t = useTranslations();
    const { isUnlocked } = useLicenseStatusContext();

    function getSubtitle() {
        if (isUnlocked() && env.branding?.loginPage?.subtitleText) {
            return env.branding.loginPage.subtitleText;
        }
        return t("loginStart");
    }

    const logoWidth = isUnlocked()
        ? env.branding.logo?.authPage?.width || 175
        : 175;
    const logoHeight = isUnlocked()
        ? env.branding.logo?.authPage?.height || 58
        : 58;

    const gradientClasses =
        build === "saas"
            ? "border-b border-primary/30 bg-gradient-to-br dark:from-primary/20 from-primary/20 via-background to-background overflow-hidden rounded-t-lg"
            : "border-b";

    return (
        <Card className="w-full max-w-md">
            <CardHeader className={gradientClasses}>
                <div className="flex flex-row items-center justify-center">
                    <BrandingLogo height={logoHeight} width={logoWidth} />
                </div>
                <div className="text-center space-y-1 pt-3">
                    <p className="text-muted-foreground">{getSubtitle()}</p>
                </div>
            </CardHeader>
            <CardContent className="pt-6">
                <LoginForm
                    redirect={redirect}
                    idps={idps}
                    forceLogin={forceLogin}
                    onLogin={(redirectUrl) => {
                        if (redirectUrl) {
                            const safe = cleanRedirect(redirectUrl);
                            router.replace(safe);
                        } else {
                            router.replace("/");
                        }
                    }}
                />
            </CardContent>
        </Card>
    );
}
