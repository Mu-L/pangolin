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
    toAiProviderAuthPayload,
    type AiProviderFormValues
} from "@app/lib/aiProviderFormSchema";
import { zodResolver } from "@hookform/resolvers/zod";
import type {
    AiProviderAuthType,
    AiProviderType
} from "@server/lib/aiProviderDefaults";
import type { CreateOrEditAiProviderResponse } from "@server/routers/aiProvider/types";
import type { AxiosResponse } from "axios";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

export default function AiProviderAuthenticationPage() {
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
            apiKey: provider.apiKey ?? "",
            authType: (provider.authType as AiProviderAuthType) ?? "bearer",
            routingMode: (provider.routingMode as "url" | "target") ?? "url",
            skipTlsVerification: provider.skipTlsVerification,
            enabled: provider.enabled
        }
    });

    const showAuthType = provider.type === "custom";

    async function onSubmit(values: AiProviderFormValues) {
        setSaveLoading(true);
        try {
            const res = await api.post<
                AxiosResponse<CreateOrEditAiProviderResponse>
            >(
                `/ai-provider/${provider.providerId}`,
                toAiProviderAuthPayload({
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
                apiKey: updated.apiKey ?? "",
                authType: (updated.authType as AiProviderAuthType) ?? "bearer",
                routingMode: (updated.routingMode as "url" | "target") ?? "url",
                skipTlsVerification: updated.skipTlsVerification,
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
                        {t("aiProviderAuthSettings")}
                    </SettingsSectionTitle>
                    <SettingsSectionDescription>
                        {t("aiProviderAuthSettingsDescription")}
                    </SettingsSectionDescription>
                </SettingsSectionHeader>

                <SettingsSectionBody>
                    <SettingsSectionForm variant="half">
                        <Form {...form}>
                            <form
                                onSubmit={form.handleSubmit(onSubmit)}
                                id="ai-provider-auth-form"
                            >
                                <SettingsFormGrid>
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
                                                                <SelectItem value="x-api-key">
                                                                    {t(
                                                                        "aiProviderAuthTypeXApiKey"
                                                                    )}
                                                                </SelectItem>
                                                                <SelectItem value="x-goog-api-key">
                                                                    {t(
                                                                        "aiProviderAuthTypeXGoogApiKey"
                                                                    )}
                                                                </SelectItem>
                                                                <SelectItem value="hec">
                                                                    {t(
                                                                        "aiProviderAuthTypeHec"
                                                                    )}
                                                                </SelectItem>
                                                                <SelectItem value="cf-aig-authorization">
                                                                    {t(
                                                                        "aiProviderAuthTypeCfAigAuthorization"
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
                                                        {t(
                                                            "aiProviderApiKeyDescription"
                                                        )}
                                                    </FormDescription>
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
                        form="ai-provider-auth-form"
                    >
                        {t("saveSettings")}
                    </Button>
                </SettingsSectionFooter>
            </SettingsSection>
        </SettingsContainer>
    );
}
