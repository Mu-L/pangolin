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
import {
    AiProvidersSelector,
    type SelectedAiProvider
} from "@app/components/AiProvidersSelector";
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
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useResourceContext } from "@app/hooks/useResourceContext";
import { toast } from "@app/hooks/useToast";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { resourceQueries } from "@app/lib/queries";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

export default function PublicResourceProvidersPage() {
    const t = useTranslations();
    const router = useRouter();
    const { env } = useEnvContext();
    const api = createApiClient({ env });
    const queryClient = useQueryClient();
    const { resource } = useResourceContext();

    useEffect(() => {
        if (resource.mode !== "inference") {
            router.replace(
                `/${resource.orgId}/settings/resources/public/${resource.niceId}/general`
            );
        }
    }, [router, resource.mode, resource.niceId, resource.orgId]);

    const formSchema = useMemo(
        () =>
            z.object({
                providerIds: z.array(z.number().int().positive())
            }),
        []
    );
    type FormValues = z.infer<typeof formSchema>;

    const [selectedProviders, setSelectedProviders] = useState<
        SelectedAiProvider[]
    >([]);

    const attachedQuery = useQuery({
        ...resourceQueries.resourceAiProviders({
            resourceId: resource.resourceId
        }),
        enabled: resource.mode === "inference"
    });

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            providerIds: []
        }
    });

    useEffect(() => {
        if (!attachedQuery.data) return;
        const providers = attachedQuery.data.map((provider) => ({
            id: String(provider.providerId),
            text: provider.name
        }));
        setSelectedProviders(providers);
        form.reset({
            providerIds: attachedQuery.data.map((p) => p.providerId)
        });
    }, [attachedQuery.data, form]);

    const [, formAction, saveLoading] = useActionState(async () => {
        const isValid = await form.trigger();
        if (!isValid) return;

        const data = form.getValues();
        try {
            await api.post(`/resource/${resource.resourceId}/ai-providers`, {
                providers: data.providerIds.map((providerId) => ({
                    providerId,
                    modelAccessMode: "catalog"
                }))
            });

            await queryClient.invalidateQueries(
                resourceQueries.resourceAiProviders({
                    resourceId: resource.resourceId
                })
            );

            toast({
                title: t("success"),
                description: t("aiResourceProvidersUpdated")
            });
        } catch (error) {
            toast({
                variant: "destructive",
                title: t("aiResourceProvidersErrorUpdate"),
                description: formatAxiosError(
                    error,
                    t("aiResourceProvidersErrorUpdate")
                )
            });
        }
    }, null);

    if (resource.mode !== "inference") {
        return null;
    }

    return (
        <SettingsContainer>
            <SettingsSection>
                <SettingsSectionHeader>
                    <SettingsSectionTitle>
                        {t("aiResourceProviders")}
                    </SettingsSectionTitle>
                    <SettingsSectionDescription>
                        {t("aiResourceProvidersDescription")}
                    </SettingsSectionDescription>
                </SettingsSectionHeader>

                <SettingsSectionBody>
                    <SettingsSectionForm variant="half">
                        <Form {...form}>
                            <form
                                action={formAction}
                                id="public-resource-providers-form"
                            >
                                <SettingsFormGrid>
                                    <SettingsFormCell span="full">
                                        <FormField
                                            control={form.control}
                                            name="providerIds"
                                            render={() => (
                                                <FormItem>
                                                    <FormLabel>
                                                        {t(
                                                            "aiResourceProviders"
                                                        )}
                                                    </FormLabel>
                                                    <FormControl>
                                                        <AiProvidersSelector
                                                            orgId={
                                                                resource.orgId
                                                            }
                                                            selectedProviders={
                                                                selectedProviders
                                                            }
                                                            disabled={
                                                                attachedQuery.isLoading ||
                                                                saveLoading
                                                            }
                                                            onSelectProviders={(
                                                                providers
                                                            ) => {
                                                                setSelectedProviders(
                                                                    providers
                                                                );
                                                                form.setValue(
                                                                    "providerIds",
                                                                    providers.map(
                                                                        (p) =>
                                                                            parseInt(
                                                                                p.id,
                                                                                10
                                                                            )
                                                                    ),
                                                                    {
                                                                        shouldValidate: true
                                                                    }
                                                                );
                                                            }}
                                                        />
                                                    </FormControl>
                                                    <FormDescription>
                                                        {t(
                                                            "aiResourceProvidersHelp"
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
                        form="public-resource-providers-form"
                        loading={saveLoading}
                        disabled={attachedQuery.isLoading}
                    >
                        {t("saveSettings")}
                    </Button>
                </SettingsSectionFooter>
            </SettingsSection>
        </SettingsContainer>
    );
}
