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
import { Label } from "@app/components/ui/label";
import { useAiProviderContext } from "@app/hooks/useAiProviderContext";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { toast } from "@app/hooks/useToast";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { aiProviderQueries } from "@app/lib/queries";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

type ModelListType = "allow" | "block";

export default function AiProviderModelsPage() {
    const { provider } = useAiProviderContext();
    const { env } = useEnvContext();
    const api = createApiClient({ env });
    const queryClient = useQueryClient();
    const t = useTranslations();
    const [saveLoading, setSaveLoading] = useState(false);
    const [allowTags, setAllowTags] = useState<Tag[]>([]);
    const [blockTags, setBlockTags] = useState<Tag[]>([]);
    const [activeAllowTagIndex, setActiveAllowTagIndex] = useState<
        number | null
    >(null);
    const [activeBlockTagIndex, setActiveBlockTagIndex] = useState<
        number | null
    >(null);

    const modelsQuery = useQuery(
        aiProviderQueries.providerModels({ providerId: provider.providerId })
    );
    const catalogQuery = useQuery(
        aiProviderQueries.catalogModels({ providerId: provider.providerId })
    );

    const catalogTags = useMemo(
        () =>
            (catalogQuery.data ?? []).map((entry) => ({
                id: entry.model,
                text: entry.model
            })),
        [catalogQuery.data]
    );

    useEffect(() => {
        if (!modelsQuery.data) return;
        setAllowTags(
            modelsQuery.data
                .filter((model) => (model.listType ?? "allow") === "allow")
                .map((model) => ({
                    id: String(model.modelId),
                    text: model.modelKey
                }))
        );
        setBlockTags(
            modelsQuery.data
                .filter((model) => model.listType === "block")
                .map((model) => ({
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

            const nextAllow = new Set(
                allowTags.map((tag) => tag.text.trim()).filter(Boolean)
            );
            const nextBlock = new Set(
                blockTags.map((tag) => tag.text.trim()).filter(Boolean)
            );

            const overlap = [...nextAllow].filter((key) => nextBlock.has(key));
            if (overlap.length > 0) {
                toast({
                    variant: "destructive",
                    title: t("aiProviderModelsErrorUpdate"),
                    description: t("aiProviderModelsOverlapError", {
                        keys: overlap.join(", ")
                    })
                });
                return;
            }

            const desired = new Map<string, ModelListType>();
            for (const key of nextAllow) {
                desired.set(key, "allow");
            }
            for (const key of nextBlock) {
                desired.set(key, "block");
            }

            const toCreate: { modelKey: string; listType: ModelListType }[] =
                [];
            const toUpdate: {
                modelId: number;
                listType: ModelListType;
            }[] = [];
            const toDelete: number[] = [];

            for (const [modelKey, listType] of desired) {
                const existingModel = existingByKey.get(modelKey);
                if (!existingModel) {
                    toCreate.push({ modelKey, listType });
                    continue;
                }
                if ((existingModel.listType ?? "allow") !== listType) {
                    toUpdate.push({
                        modelId: existingModel.modelId,
                        listType
                    });
                }
            }

            for (const model of existing) {
                if (!desired.has(model.modelKey)) {
                    toDelete.push(model.modelId);
                }
            }

            await Promise.all([
                ...toCreate.map(({ modelKey, listType }) =>
                    api.put(`/ai-provider/${provider.providerId}/model`, {
                        modelKey,
                        name: modelKey,
                        listType
                    })
                ),
                ...toUpdate.map(({ modelId, listType }) =>
                    api.post(`/ai-model/${modelId}`, { listType })
                ),
                ...toDelete.map((modelId) => api.delete(`/ai-model/${modelId}`))
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

    const inputsDisabled = modelsQuery.isLoading || saveLoading;

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
                        <div className="space-y-2">
                            <Label>{t("aiProviderModelsAllow")}</Label>
                            <TagInput
                                activeTagIndex={activeAllowTagIndex}
                                setActiveTagIndex={setActiveAllowTagIndex}
                                placeholder={t(
                                    "aiProviderModelsAllowPlaceholder"
                                )}
                                size="sm"
                                tags={allowTags}
                                setTags={(newTags) => {
                                    const next =
                                        typeof newTags === "function"
                                            ? newTags(allowTags)
                                            : newTags;
                                    setAllowTags(next as Tag[]);
                                }}
                                enableAutocomplete={catalogTags.length > 0}
                                autocompleteOptions={catalogTags}
                                allowDuplicates={false}
                                sortTags
                                delimiterList={[",", "Enter"]}
                                disabled={inputsDisabled}
                            />
                            <p className="text-sm text-muted-foreground">
                                {t("aiProviderModelsAllowDescription")}
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label>{t("aiProviderModelsBlock")}</Label>
                            <TagInput
                                activeTagIndex={activeBlockTagIndex}
                                setActiveTagIndex={setActiveBlockTagIndex}
                                placeholder={t(
                                    "aiProviderModelsBlockPlaceholder"
                                )}
                                size="sm"
                                tags={blockTags}
                                setTags={(newTags) => {
                                    const next =
                                        typeof newTags === "function"
                                            ? newTags(blockTags)
                                            : newTags;
                                    setBlockTags(next as Tag[]);
                                }}
                                enableAutocomplete={catalogTags.length > 0}
                                autocompleteOptions={catalogTags}
                                allowDuplicates={false}
                                sortTags
                                delimiterList={[",", "Enter"]}
                                disabled={inputsDisabled}
                            />
                            <p className="text-sm text-muted-foreground">
                                {t("aiProviderModelsBlockDescription")}
                            </p>
                        </div>
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
