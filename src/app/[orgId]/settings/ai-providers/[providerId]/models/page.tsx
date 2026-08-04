"use client";

import {
    SettingsContainer,
    SettingsSection,
    SettingsSectionBody,
    SettingsSectionDescription,
    SettingsSectionFooter,
    SettingsSectionForm,
    SettingsSectionHeader,
    SettingsSectionTitle
} from "@app/components/Settings";
import { TagInput, type Tag } from "@app/components/tags/tag-input";
import { Button } from "@app/components/ui/button";
import { useAiProviderContext } from "@app/hooks/useAiProviderContext";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { toast } from "@app/hooks/useToast";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { aiProviderQueries } from "@app/lib/queries";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

export default function AiProviderModelsPage() {
    const { provider } = useAiProviderContext();
    const { env } = useEnvContext();
    const api = createApiClient({ env });
    const queryClient = useQueryClient();
    const t = useTranslations();
    const [saveLoading, setSaveLoading] = useState(false);
    const [tags, setTags] = useState<Tag[]>([]);
    const [activeTagIndex, setActiveTagIndex] = useState<number | null>(null);

    const modelsQuery = useQuery(
        aiProviderQueries.providerModels({ providerId: provider.providerId })
    );

    useEffect(() => {
        if (!modelsQuery.data) return;
        setTags(
            modelsQuery.data.map((model) => ({
                id: String(model.modelId),
                text: model.modelKey
            }))
        );
    }, [modelsQuery.data]);

    async function onSave() {
        setSaveLoading(true);
        try {
            const existing = modelsQuery.data ?? [];
            const existingByKey = new Map(
                existing.map((model) => [model.modelKey, model])
            );
            const nextKeys = new Set(
                tags.map((tag) => tag.text.trim()).filter(Boolean)
            );

            const toCreate = [...nextKeys].filter(
                (key) => !existingByKey.has(key)
            );
            const toDelete = existing.filter(
                (model) => !nextKeys.has(model.modelKey)
            );

            await Promise.all([
                ...toCreate.map((modelKey) =>
                    api.put(`/ai-provider/${provider.providerId}/model`, {
                        modelKey,
                        name: modelKey
                    })
                ),
                ...toDelete.map((model) =>
                    api.delete(`/ai-model/${model.modelId}`)
                )
            ]);

            await queryClient.invalidateQueries(
                aiProviderQueries.providerModels({
                    providerId: provider.providerId
                })
            );

            toast({
                title: t("success"),
                description: t("aiProviderModelsUpdated")
            });
        } catch (e) {
            toast({
                variant: "destructive",
                title: t("aiProviderModelsErrorUpdate"),
                description: formatAxiosError(
                    e,
                    t("aiProviderModelsErrorUpdate")
                )
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
                        {t("aiProviderModels")}
                    </SettingsSectionTitle>
                    <SettingsSectionDescription>
                        {t("aiProviderModelsDescription")}
                    </SettingsSectionDescription>
                </SettingsSectionHeader>

                <SettingsSectionBody>
                    <SettingsSectionForm variant="half">
                        <TagInput
                            activeTagIndex={activeTagIndex}
                            setActiveTagIndex={setActiveTagIndex}
                            placeholder={t("aiProviderModelsPlaceholder")}
                            size="sm"
                            tags={tags}
                            setTags={(newTags) => {
                                const next =
                                    typeof newTags === "function"
                                        ? newTags(tags)
                                        : newTags;
                                setTags(next as Tag[]);
                            }}
                            allowDuplicates={false}
                            sortTags
                            delimiterList={[",", "Enter"]}
                            disabled={modelsQuery.isLoading || saveLoading}
                        />
                    </SettingsSectionForm>
                </SettingsSectionBody>

                <SettingsSectionFooter>
                    <Button
                        type="button"
                        loading={saveLoading}
                        disabled={saveLoading || modelsQuery.isLoading}
                        onClick={onSave}
                    >
                        {t("saveSettings")}
                    </Button>
                </SettingsSectionFooter>
            </SettingsSection>
        </SettingsContainer>
    );
}
