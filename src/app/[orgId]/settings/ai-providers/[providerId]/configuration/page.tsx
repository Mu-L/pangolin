"use client";

import {
    SettingsContainer,
    SettingsFormCell,
    SettingsFormGrid,
    SettingsSection,
    SettingsSectionBody,
    SettingsSectionDescription,
    SettingsSectionFooter,
    SettingsSectionForm,
    SettingsSectionHeader,
    SettingsSectionTitle
} from "@app/components/Settings";
import { StrategySelect } from "@app/components/StrategySelect";
import { SwitchInput } from "@app/components/SwitchInput";
import { Alert, AlertDescription, AlertTitle } from "@app/components/ui/alert";
import { Button } from "@app/components/ui/button";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@app/components/ui/form";
import { Input } from "@app/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@app/components/ui/select";
import { useAiProviderContext } from "@app/hooks/useAiProviderContext";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { toast } from "@app/hooks/useToast";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import {
    aiProviderFormSchema,
    showsUpstreamUrlField,
    toAiProviderConfigurationPayload,
    upstreamUrlRequired,
    type AiProviderFormValues
} from "@app/lib/aiProviderFormSchema";
import { zodResolver } from "@hookform/resolvers/zod";
import type { AiProviderType } from "@server/lib/aiProviderDefaults";
import type { CreateOrEditAiProviderResponse } from "@server/routers/aiProvider/types";
import type { AxiosResponse } from "axios";
import { InfoIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

export default function AiProviderConfigurationPage() {
    const { provider, updateProvider } = useAiProviderContext();
    const { env } = useEnvContext();
    const api = createApiClient({ env });
    const router = useRouter();
    const t = useTranslations();
    const [saveLoading, setSaveLoading] = useState(false);

    const form = useForm<AiProviderFormValues>({
        resolver: zodResolver(aiProviderFormSchema),
        defaultValues: {
            name: provider.name,
            type: provider.type as AiProviderType,
            upstreamUrl: provider.upstreamUrl ?? "",
            apiKey: "",
            authType: (provider.authType as "bearer" | null) ?? "bearer",
            routingMode: (provider.routingMode as "url" | "target") ?? "url",
            skipTlsVerification: provider.skipTlsVerification,
            budgetAmount: provider.budgetAmount,
            budgetUnit: provider.budgetUnit as "usd" | "tokens" | null,
            enabled: provider.enabled
        }
    });

    const providerType = form.watch("type");
    const routingMode = form.watch("routingMode");
    const showUpstream = showsUpstreamUrlField(providerType, routingMode);
    const requireUpstream = upstreamUrlRequired(providerType, routingMode);
    const showRoutingMode = providerType === "custom";
    const showAuthType =
        providerType === "custom" && (routingMode ?? "url") === "url";
    const showTargetNote =
        providerType === "custom" && routingMode === "target";

    async function onSubmit(values: AiProviderFormValues) {
        setSaveLoading(true);
        try {
            const res = await api.post<
                AxiosResponse<CreateOrEditAiProviderResponse>
            >(
                `/ai-provider/${provider.providerId}`,
                toAiProviderConfigurationPayload({
                    ...values,
                    type: provider.type as AiProviderType
                })
            );
            const updated = res.data.data.provider;
            updateProvider(updated);
            form.reset({
                name: updated.name,
                type: updated.type as AiProviderType,
                upstreamUrl: updated.upstreamUrl ?? "",
                apiKey: "",
                authType: (updated.authType as "bearer" | null) ?? "bearer",
                routingMode: (updated.routingMode as "url" | "target") ?? "url",
                skipTlsVerification: updated.skipTlsVerification,
                budgetAmount: updated.budgetAmount,
                budgetUnit: updated.budgetUnit as "usd" | "tokens" | null,
                enabled: updated.enabled
            });
            toast({
                title: t("success"),
                description: t("aiProviderUpdated")
            });
            router.refresh();
        } catch (e) {
            toast({
                variant: "destructive",
                title: t("aiProviderErrorUpdate"),
                description: formatAxiosError(e, t("aiProviderErrorUpdate"))
            });
        } finally {
            setSaveLoading(false);
        }
    }

    return (
        <SettingsContainer>
            <SettingsSection>
                <SettingsSectionHeader>
                    <SettingsSectionTitle>
                        {t("aiProviderConfiguration")}
                    </SettingsSectionTitle>
                    <SettingsSectionDescription>
                        {t("aiProviderConfigurationDescription")}
                    </SettingsSectionDescription>
                </SettingsSectionHeader>

                <SettingsSectionBody>
                    <SettingsSectionForm variant="half">
                        <Form {...form}>
                            <form
                                onSubmit={form.handleSubmit(onSubmit)}
                                id="ai-provider-configuration-form"
                            >
                                <SettingsFormGrid>
                                    {showRoutingMode && (
                                        <SettingsFormCell span="full">
                                            <FormField
                                                control={form.control}
                                                name="routingMode"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            {t(
                                                                "aiProviderRoutingMode"
                                                            )}
                                                        </FormLabel>
                                                        <FormControl>
                                                            <StrategySelect
                                                                options={[
                                                                    {
                                                                        id: "url",
                                                                        title: t(
                                                                            "aiProviderRoutingModeUrl"
                                                                        ),
                                                                        description:
                                                                            t(
                                                                                "aiProviderRoutingModeUrlDescription"
                                                                            )
                                                                    },
                                                                    {
                                                                        id: "target",
                                                                        title: t(
                                                                            "aiProviderRoutingModeTarget"
                                                                        ),
                                                                        description:
                                                                            t(
                                                                                "aiProviderRoutingModeTargetDescription"
                                                                            )
                                                                    }
                                                                ]}
                                                                value={
                                                                    field.value ??
                                                                    "url"
                                                                }
                                                                onChange={(
                                                                    value
                                                                ) => {
                                                                    field.onChange(
                                                                        value
                                                                    );
                                                                    if (
                                                                        value ===
                                                                        "target"
                                                                    ) {
                                                                        form.setValue(
                                                                            "upstreamUrl",
                                                                            ""
                                                                        );
                                                                    }
                                                                }}
                                                            />
                                                        </FormControl>
                                                        <FormDescription>
                                                            {t(
                                                                "aiProviderRoutingModeDescription"
                                                            )}
                                                        </FormDescription>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </SettingsFormCell>
                                    )}

                                    {showTargetNote && (
                                        <SettingsFormCell span="full">
                                            <Alert variant="neutral">
                                                <InfoIcon className="h-4 w-4" />
                                                <AlertTitle>
                                                    {t(
                                                        "aiProviderRoutingModeTarget"
                                                    )}
                                                </AlertTitle>
                                                <AlertDescription>
                                                    {t(
                                                        "aiProviderRoutingModeTargetNote"
                                                    )}
                                                </AlertDescription>
                                            </Alert>
                                        </SettingsFormCell>
                                    )}

                                    {showUpstream && (
                                        <SettingsFormCell span="half">
                                            <FormField
                                                control={form.control}
                                                name="upstreamUrl"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            {t(
                                                                "aiProviderUpstreamUrl"
                                                            )}
                                                            {requireUpstream
                                                                ? ""
                                                                : " (optional)"}
                                                        </FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                autoComplete="off"
                                                                placeholder="https://"
                                                                value={
                                                                    field.value ??
                                                                    ""
                                                                }
                                                                onChange={
                                                                    field.onChange
                                                                }
                                                            />
                                                        </FormControl>
                                                        <FormDescription>
                                                            {requireUpstream
                                                                ? t(
                                                                      "aiProviderUpstreamUrlDescription"
                                                                  )
                                                                : t(
                                                                      "aiProviderUpstreamUrlOptionalDescription"
                                                                  )}
                                                        </FormDescription>
                                                        {provider.effectiveUpstreamUrl && (
                                                            <FormDescription>
                                                                {t(
                                                                    "aiProviderEffectiveUpstreamUrl"
                                                                )}
                                                                {": "}
                                                                <span className="font-mono">
                                                                    {
                                                                        provider.effectiveUpstreamUrl
                                                                    }
                                                                </span>
                                                            </FormDescription>
                                                        )}
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </SettingsFormCell>
                                    )}

                                    {showAuthType && (
                                        <SettingsFormCell span="half">
                                            <FormField
                                                control={form.control}
                                                name="authType"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            {t(
                                                                "aiProviderAuthType"
                                                            )}
                                                        </FormLabel>
                                                        <Select
                                                            value={
                                                                field.value ??
                                                                "bearer"
                                                            }
                                                            onValueChange={
                                                                field.onChange
                                                            }
                                                        >
                                                            <FormControl>
                                                                <SelectTrigger>
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                <SelectItem value="bearer">
                                                                    {t(
                                                                        "aiProviderAuthTypeBearer"
                                                                    )}
                                                                </SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                        <FormDescription>
                                                            {t(
                                                                "aiProviderAuthTypeDescription"
                                                            )}
                                                        </FormDescription>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </SettingsFormCell>
                                    )}

                                    <SettingsFormCell span="half">
                                        <FormField
                                            control={form.control}
                                            name="apiKey"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>
                                                        {t("aiProviderApiKey")}
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="password"
                                                            autoComplete="new-password"
                                                            value={
                                                                field.value ??
                                                                ""
                                                            }
                                                            onChange={
                                                                field.onChange
                                                            }
                                                        />
                                                    </FormControl>
                                                    <FormDescription>
                                                        {provider.apiKeyLastChars
                                                            ? `••••${provider.apiKeyLastChars}. ${t("aiProviderApiKeyDescription")}`
                                                            : t(
                                                                  "aiProviderApiKeyDescription"
                                                              )}
                                                    </FormDescription>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </SettingsFormCell>

                                    <SettingsFormCell span="half">
                                        <FormField
                                            control={form.control}
                                            name="skipTlsVerification"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormControl>
                                                        <SwitchInput
                                                            id="edit-skip-tls"
                                                            label={t(
                                                                "aiProviderSkipTlsVerification"
                                                            )}
                                                            description={t(
                                                                "aiProviderSkipTlsVerificationDescription"
                                                            )}
                                                            checked={
                                                                field.value ??
                                                                false
                                                            }
                                                            onCheckedChange={
                                                                field.onChange
                                                            }
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </SettingsFormCell>
                                </SettingsFormGrid>
                            </form>
                        </Form>
                    </SettingsSectionForm>
                </SettingsSectionBody>
                <SettingsSectionFooter>
                    <Button
                        type="submit"
                        loading={saveLoading}
                        disabled={saveLoading}
                        form="ai-provider-configuration-form"
                    >
                        {t("saveSettings")}
                    </Button>
                </SettingsSectionFooter>
            </SettingsSection>
        </SettingsContainer>
    );
}
