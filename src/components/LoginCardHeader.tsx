"use client";

import BrandingLogo from "@app/components/BrandingLogo";
import { useLicenseStatusContext } from "@app/hooks/useLicenseStatusContext";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { CardHeader } from "./ui/card";

type LoginCardHeaderProps = {
    subtitle: string;
};

export default function LoginCardHeader({ subtitle }: LoginCardHeaderProps) {
    const { env } = useEnvContext();
    const { isUnlocked } = useLicenseStatusContext();

    const logoWidth = isUnlocked()
        ? env.branding.logo?.authPage?.width || 175
        : 175;
    const logoHeight = isUnlocked()
        ? env.branding.logo?.authPage?.height || 44
        : 44;

    return (
        <CardHeader className="border-b">
            <div className="flex flex-row items-center justify-center">
                <BrandingLogo height={logoHeight} width={logoWidth} />
            </div>
            <div className="text-center space-y-1 pt-3">
                <p className="text-muted-foreground">{subtitle}</p>
            </div>
        </CardHeader>
    );
}
