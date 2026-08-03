"use client";

import {
    ProxyResourceTargetsForm,
    type LocalTarget
} from "@app/app/[orgId]/settings/resources/public/ProxyResourceTargetsForm";
import {
    SettingsContainer,
    SettingsFormCell,
    SettingsFormGrid,
    SettingsSection,
    SettingsSectionBody,
    SettingsSectionDescription,
    SettingsSectionForm,
    SettingsSectionHeader,
    SettingsSectionTitle,
    SettingsSubsectionDescription,
    SettingsSubsectionHeader,
    SettingsSubsectionTitle
} from "@app/components/Settings";
import HeaderTitle from "@app/components/SettingsSectionTitle";
import { AiProviderTypeSelect } from "@app/components/AiProviderTypeSelect";
import { StrategySelect } from "@app/components/StrategySelect";
import { SwitchInput } from "@app/components/SwitchInput";
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
    aiProviderCreateFormSchema,
    emptyUpstreamForType,
    showsUpstreamUrlField,
    toAiProviderCreatePayload,
    upstreamUrlRequired,
    type AiProviderFormValues
} from "@app/lib/aiProviderFormSchema";
import { zodResolver } from "@hookform/resolvers/zod";
import type { CreateOrEditAiProviderResponse } from "@server/routers/aiProvider/types";
import type { AxiosResponse } from "axios";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";

export default function CreateAiProviderPage() {
    const { env } = useEnvContext();
    const api = createApiClient({ env });
    const params = useParams();
    const orgId = params.orgId as string;
    const router = useRouter();
    const t = useTranslations();
    const [loading, setLoading] = useState(false);
    const targetsRef = useRef<LocalTarget[]>([]);

    const form = useForm<AiProviderFormValues>({
        resolver: zodResolver(aiProviderCreateFormSchema),
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
    const showAuthType = providerType === "custom";
    const showTargets = providerType === "custom" && routingMode === "target";

    async function createTargets(
        providerId: number,
        localTargets: LocalTarget[]
    ) {
        for (const target of localTargets) {
            const data = {
                ip: target.ip,
                port: target.port,
                method: target.method,
                enabled: target.enabled,
                siteId: target.siteId,
                hcEnabled: target.hcEnabled,
                hcPath: target.hcPath || null,
                hcMethod: target.hcMethod || null,
                hcInterval: target.hcInterval || null,
                hcTimeout: target.hcTimeout || null,
                hcHeaders: target.hcHeaders || null,
                hcScheme: target.hcScheme || null,
                hcHostname: target.hcHostname || null,
                hcPort: target.hcPort || null,
                hcFollowRedirects: target.hcFollowRedirects || null,
                hcStatus: target.hcStatus || null,
                hcUnhealthyInterval: target.hcUnhealthyInterval || null,
                hcMode: target.hcMode || null,
                hcTlsServerName: target.hcTlsServerName,
                hcHealthyThreshold: target.hcHealthyThreshold || null,
                hcUnhealthyThreshold: target.hcUnhealthyThreshold || null,
                path: target.path,
                pathMatchType: target.pathMatchType,
                rewritePath: target.rewritePath,
                rewritePathType: target.rewritePathType,
                priority: target.priority
            };
            await api.put(`/ai-provider/${providerId}/target`, data);
        }
    }

    async function onSubmit(values: AiProviderFormValues) {
        const targets = targetsRef.current;

        if (showTargets) {
            const invalidTargets = targets.filter(
                (target) =>
                    !target.ip ||
                    target.ip.trim() === "" ||
                    !target.port ||
                    target.port <= 0 ||
                    isNaN(target.port)
            );
            if (invalidTargets.length > 0) {
                toast({
                    variant: "destructive",
                    title: t("targetErrorInvalidIp"),
                    description: t("targetErrorInvalidIpDescription")
                });
                return;
            }
        }

        setLoading(true);
        try {
            const res = await api.put<
                AxiosResponse<CreateOrEditAiProviderResponse>
            >(`/org/${orgId}/ai-provider`, toAiProviderCreatePayload(values));

            const providerId = res.data.data.provider.providerId;

            if (showTargets && targets.length > 0) {
                try {
                    await createTargets(providerId, targets);
                } catch (e) {
                    toast({
                        variant: "destructive",
                        title: t("aiProviderErrorCreate"),
                        description: formatAxiosError(
                            e,
                            t("aiProviderErrorCreate")
                        )
                    });
                    router.push(
                        `/${orgId}/settings/ai-providers/${providerId}/network`
                    );
                    return;
                }
            }

            toast({
                title: t("success"),
                description: t("aiProviderCreated")
            });

            router.push(`/${orgId}/settings/ai-providers/${providerId}`);
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

            <Form {...form}>
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
                                <SettingsFormGrid>
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
                                                        {t("aiProviderType")}
                                                    </FormLabel>
                                                    <FormControl>
                                                        <AiProviderTypeSelect
                                                            value={field.value}
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
                                                                    targetsRef.current =
                                                                        [];
                                                                }
                                                            }}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </SettingsFormCell>
                                </SettingsFormGrid>
                            </SettingsSectionForm>
                        </SettingsSectionBody>
                    </SettingsSection>

                    <SettingsSection>
                        <SettingsSectionHeader>
                            <SettingsSectionTitle>
                                {t("aiProviderNetworkSettings")}
                            </SettingsSectionTitle>
                            <SettingsSectionDescription>
                                {t("aiProviderNetworkSettingsDescription")}
                            </SettingsSectionDescription>
                        </SettingsSectionHeader>

                        <SettingsSectionBody>
                            <SettingsSectionForm variant="half">
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
                                                                cols={2}
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
                                                                    } else {
                                                                        targetsRef.current =
                                                                            [];
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
                            </SettingsSectionForm>

                            {showTargets && (
                                <div className="mt-6 space-y-4">
                                    <SettingsSubsectionHeader>
                                        <SettingsSubsectionTitle>
                                            {t("targets")}
                                        </SettingsSubsectionTitle>
                                        <SettingsSubsectionDescription>
                                            {t("targetsDescription")}
                                        </SettingsSubsectionDescription>
                                    </SettingsSubsectionHeader>
                                    <ProxyResourceTargetsForm
                                        orgId={orgId}
                                        isHttp
                                        onChange={(nextTargets) => {
                                            targetsRef.current = nextTargets;
                                        }}
                                        allowedMethods={["http", "https"]}
                                        emptyMessage={t(
                                            "aiProviderTargetNoOne"
                                        )}
                                        embedded
                                        hideSaveButton
                                    />
                                </div>
                            )}
                        </SettingsSectionBody>
                    </SettingsSection>

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
                            </SettingsSectionForm>
                        </SettingsSectionBody>
                    </SettingsSection>
                </SettingsContainer>

                <div className="flex justify-end space-x-2 mt-8">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                            router.push(`/${orgId}/settings/ai-providers`)
                        }
                    >
                        {t("cancel")}
                    </Button>
                    <Button
                        type="button"
                        loading={loading}
                        disabled={loading}
                        onClick={() => {
                            form.handleSubmit(onSubmit)();
                        }}
                    >
                        {t("create")}
                    </Button>
                </div>
            </Form>
        </>
    );
}
