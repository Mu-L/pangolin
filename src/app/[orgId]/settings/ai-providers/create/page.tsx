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
import HeaderTitle from "@app/components/SettingsSectionTitle";
import { AiProviderTypeSelect } from "@app/components/AiProviderTypeSelect";
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
import { useEnvContext } from "@app/hooks/useEnvContext";
import { toast } from "@app/hooks/useToast";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import {
    aiProviderFormSchema,
    emptyUpstreamForType,
    showsUpstreamUrlField,
    toAiProviderCreatePayload,
    upstreamUrlRequired,
    type AiProviderFormValues
} from "@app/lib/aiProviderFormSchema";
import { zodResolver } from "@hookform/resolvers/zod";
import type { CreateOrEditAiProviderResponse } from "@server/routers/aiProvider/types";
import type { AxiosResponse } from "axios";
import { InfoIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

export default function CreateAiProviderPage() {
    const { env } = useEnvContext();
    const api = createApiClient({ env });
    const params = useParams();
    const orgId = params.orgId as string;
    const router = useRouter();
    const t = useTranslations();
    const [loading, setLoading] = useState(false);

    const form = useForm<AiProviderFormValues>({
        resolver: zodResolver(aiProviderFormSchema),
        defaultValues: {
            name: "",
            type: "openai",
            upstreamUrl: emptyUpstreamForType("openai"),
            apiKey: "",
            authType: "bearer",
            routingMode: "url",
            skipTlsVerification: false,
            budgetAmount: null,
            budgetUnit: null,
            enabled: true
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
        setLoading(true);
        try {
            const res = await api.put<
                AxiosResponse<CreateOrEditAiProviderResponse>
            >(`/org/${orgId}/ai-provider`, toAiProviderCreatePayload(values));

            toast({
                title: t("success"),
                description: t("aiProviderCreated")
            });

            router.push(
                `/${orgId}/settings/ai-providers/${res.data.data.provider.providerId}`
            );
        } catch (e) {
            toast({
                variant: "destructive",
                title: t("aiProviderErrorCreate"),
                description: formatAxiosError(e, t("aiProviderErrorCreate"))
            });
        } finally {
            setLoading(false);
        }
    }

    return (
        <>
            <div className="flex justify-between">
                <HeaderTitle
                    title={t("aiProviderCreate")}
                    description={t("aiProviderCreateDescription")}
                />
                <Button
                    variant="outline"
                    onClick={() =>
                        router.push(`/${orgId}/settings/ai-providers`)
                    }
                >
                    {t("aiProviderSeeAll")}
                </Button>
            </div>

            <SettingsContainer>
                <SettingsSection>
                    <SettingsSectionHeader>
                        <SettingsSectionTitle>
                            {t("aiProviderGeneral")}
                        </SettingsSectionTitle>
                        <SettingsSectionDescription>
                            {t("aiProviderGeneralDescription")}
                        </SettingsSectionDescription>
                    </SettingsSectionHeader>

                    <SettingsSectionBody>
                        <SettingsSectionForm variant="half">
                            <Form {...form}>
                                <form
                                    onSubmit={form.handleSubmit(onSubmit)}
                                    id="create-ai-provider-form"
                                >
                                    <SettingsFormGrid>
                                        <SettingsFormCell span="full">
                                            <FormField
                                                control={form.control}
                                                name="enabled"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormControl>
                                                            <SwitchInput
                                                                id="enabled"
                                                                label={t(
                                                                    "aiProviderEnabled"
                                                                )}
                                                                description={t(
                                                                    "aiProviderEnabledDescription"
                                                                )}
                                                                checked={
                                                                    field.value ??
                                                                    true
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

                                        <SettingsFormCell span="half">
                                            <FormField
                                                control={form.control}
                                                name="name"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            {t("name")}
                                                        </FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                autoComplete="off"
                                                                {...field}
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </SettingsFormCell>

                                        <SettingsFormCell span="half">
                                            <FormField
                                                control={form.control}
                                                name="type"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            {t(
                                                                "aiProviderType"
                                                            )}
                                                        </FormLabel>
                                                        <FormControl>
                                                            <AiProviderTypeSelect
                                                                value={
                                                                    field.value
                                                                }
                                                                onChange={(
                                                                    value
                                                                ) => {
                                                                    field.onChange(
                                                                        value
                                                                    );
                                                                    form.setValue(
                                                                        "upstreamUrl",
                                                                        emptyUpstreamForType(
                                                                            value
                                                                        )
                                                                    );
                                                                    if (
                                                                        value !==
                                                                        "custom"
                                                                    ) {
                                                                        form.setValue(
                                                                            "routingMode",
                                                                            "url"
                                                                        );
                                                                    }
                                                                }}
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </SettingsFormCell>

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
                                                            {t(
                                                                "aiProviderApiKey"
                                                            )}
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

                                        <SettingsFormCell span="half">
                                            <FormField
                                                control={form.control}
                                                name="skipTlsVerification"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormControl>
                                                            <SwitchInput
                                                                id="skip-tls"
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
                            loading={loading}
                            disabled={loading}
                            form="create-ai-provider-form"
                        >
                            {t("create")}
                        </Button>
                    </SettingsSectionFooter>
                </SettingsSection>
            </SettingsContainer>
        </>
    );
}
