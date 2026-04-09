"use client";

import {
    StrategySelect,
    type StrategyOption
} from "@app/components/StrategySelect";
import { useEnvContext } from "@app/hooks/useEnvContext";
import type { IdpOidcProviderType } from "@app/lib/idp/oidcIdpProviderDefaults";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useEffect, useMemo } from "react";

type Props = {
    value: IdpOidcProviderType;
    onTypeChange: (type: IdpOidcProviderType) => void;
};

export function OidcIdpProviderTypeSelect({ value, onTypeChange }: Props) {
    const t = useTranslations();
    const { env } = useEnvContext();
    const hideTemplates = env.flags.disableEnterpriseFeatures;

    useEffect(() => {
        if (hideTemplates && (value === "google" || value === "azure")) {
            onTypeChange("oidc");
        }
    }, [hideTemplates, value, onTypeChange]);

    const options: ReadonlyArray<StrategyOption<IdpOidcProviderType>> =
        useMemo(() => {
            const base: StrategyOption<IdpOidcProviderType>[] = [
                {
                    id: "oidc",
                    title: "OAuth2/OIDC",
                    description: t("idpOidcDescription")
                }
            ];
            if (hideTemplates) {
                return base;
            }
            return [
                ...base,
                {
                    id: "google",
                    title: t("idpGoogleTitle"),
                    description: t("idpGoogleDescription"),
                    icon: (
                        <Image
                            src="/idp/google.png"
                            alt={t("idpGoogleAlt")}
                            width={24}
                            height={24}
                            className="rounded"
                        />
                    )
                },
                {
                    id: "azure",
                    title: t("idpAzureTitle"),
                    description: t("idpAzureDescription"),
                    icon: (
                        <Image
                            src="/idp/azure.png"
                            alt={t("idpAzureAlt")}
                            width={24}
                            height={24}
                            className="rounded"
                        />
                    )
                }
            ];
        }, [hideTemplates, t]);

    return (
        <div>
            <div className="mb-2">
                <span className="text-sm font-medium">{t("idpType")}</span>
            </div>
            <StrategySelect
                value={value}
                options={options}
                onChange={onTypeChange}
                cols={3}
            />
        </div>
    );
}
