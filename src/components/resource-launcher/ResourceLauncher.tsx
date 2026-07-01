"use client";

import {
    Credenza,
    CredenzaBody,
    CredenzaContent,
    CredenzaDescription,
    CredenzaFooter,
    CredenzaHeader,
    CredenzaTitle
} from "@app/components/Credenza";
import { Button } from "@app/components/ui/button";
import { CheckboxWithLabel } from "@app/components/ui/checkbox";
import { Input } from "@app/components/ui/input";
import { Label } from "@app/components/ui/label";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import {
    readLauncherLastView,
    writeLauncherLastView,
    type LauncherActiveViewId
} from "@app/lib/launcherLocalStorage";
import {
    buildLauncherPath,
    getLauncherUrlBaseConfig,
    isLauncherConfigEqual,
    resolveLauncherStateFromUrl,
    serializeLauncherUrlState
} from "@app/lib/launcherUrlState";
import { launcherQueries } from "@app/lib/queries";
import { useToast } from "@app/hooks/useToast";
import { useEnvContext } from "@app/hooks/useEnvContext";
import {
    defaultLauncherViewConfig,
    type LauncherViewConfig,
    type LauncherViewRecord
} from "@server/routers/launcher/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import type { Selectedsite } from "@app/components/site-selector";
import type { SelectedLabel } from "@app/components/labels-selector";
import { LauncherFilterPopover } from "./LauncherFilterPopover";
import { LauncherGroupList } from "./LauncherGroupList";
import { LauncherSettingsMenu } from "./LauncherSettingsMenu";
import { LauncherSortButton } from "./LauncherSortButton";
import { LauncherSaveViewMenu, LauncherViewTabs } from "./LauncherViewTabs";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";

type ResourceLauncherProps = {
    orgId: string;
    isAdmin: boolean;
};

export default function ResourceLauncher({
    orgId,
    isAdmin
}: ResourceLauncherProps) {
    const t = useTranslations();
    const { toast } = useToast();
    const { env } = useEnvContext();
    const queryClient = useQueryClient();
    const api = createApiClient({ env });
    const router = useRouter();
    const searchParams = useSearchParams();

    const [activeViewId, setActiveViewId] =
        useState<LauncherActiveViewId>("default");
    const hasRestoredLastView = useRef(false);
    const isApplyingUrlRef = useRef(false);

    const [config, setConfig] = useState<LauncherViewConfig>(
        defaultLauncherViewConfig
    );
    const [savedConfig, setSavedConfig] = useState<LauncherViewConfig>(
        defaultLauncherViewConfig
    );
    const [searchInput, setSearchInput] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [saveDialogOpen, setSaveDialogOpen] = useState(false);
    const [newViewName, setNewViewName] = useState("");
    const [saveOrgWide, setSaveOrgWide] = useState(false);

    const configRef = useRef(config);
    configRef.current = config;
    const searchInputRef = useRef(searchInput);
    searchInputRef.current = searchInput;
    const activeViewIdRef = useRef(activeViewId);
    activeViewIdRef.current = activeViewId;

    const { data: views = [], isLoading: viewsLoading } = useQuery(
        launcherQueries.views(orgId)
    );

    const syncUrl = useCallback(
        (viewId: LauncherActiveViewId, nextConfig: LauncherViewConfig) => {
            if (isApplyingUrlRef.current) {
                return;
            }

            const params = serializeLauncherUrlState({
                viewId,
                config: nextConfig
            });
            const path = buildLauncherPath(orgId, params);
            router.replace(path, { scroll: false });
        },
        [orgId, router]
    );

    const debouncedSyncSearch = useDebouncedCallback(
        (viewId: LauncherActiveViewId, query: string) => {
            const nextConfig = { ...configRef.current, query };
            setSearchQuery(query);
            syncUrl(viewId, nextConfig);
        },
        300
    );

    useEffect(() => {
        if (viewsLoading) {
            return;
        }

        let fallbackViewId: LauncherActiveViewId | null = null;
        if (!hasRestoredLastView.current) {
            hasRestoredLastView.current = true;
            fallbackViewId = readLauncherLastView(orgId);
        }

        isApplyingUrlRef.current = true;
        const resolved = resolveLauncherStateFromUrl(
            new URLSearchParams(searchParams),
            views,
            fallbackViewId
        );

        setActiveViewId(resolved.activeViewId);
        setConfig(resolved.config);
        setSavedConfig(resolved.savedConfig);
        setSearchInput(resolved.config.query);
        setSearchQuery(resolved.config.query);
        isApplyingUrlRef.current = false;
    }, [orgId, searchParams, views, viewsLoading]);

    const selectView = useCallback(
        (viewId: LauncherActiveViewId) => {
            writeLauncherLastView(orgId, viewId);
            const baseConfig = getLauncherUrlBaseConfig(viewId, views);
            syncUrl(viewId, baseConfig);
        },
        [orgId, syncUrl, views]
    );

    const activeSavedView = useMemo(
        () =>
            activeViewId === "default"
                ? null
                : views.find((view) => view.viewId === activeViewId),
        [activeViewId, views]
    );

    const isDefaultView = activeViewId === "default";
    const isOrgWideView = Boolean(activeSavedView?.isOrgWide);
    const hasUnsavedChanges = !isLauncherConfigEqual(config, savedConfig);

    const selectedSites: Selectedsite[] = useMemo(
        () =>
            config.siteIds.map((siteId) => ({
                siteId,
                name: String(siteId),
                type: "newt"
            })),
        [config.siteIds]
    );

    const selectedLabels: SelectedLabel[] = useMemo(
        () =>
            config.labelIds.map((labelId) => ({
                labelId,
                name: String(labelId),
                color: "#a1a1aa"
            })),
        [config.labelIds]
    );

    const invalidateLauncher = () => {
        void queryClient.invalidateQueries({
            queryKey: ["ORG", orgId, "LAUNCHER"]
        });
    };

    const createViewMutation = useMutation({
        mutationFn: async (payload: {
            name: string;
            config: LauncherViewConfig;
            orgWide: boolean;
        }) => {
            const res = await api.post(`/org/${orgId}/launcher/views`, payload);
            return res.data.data as LauncherViewRecord;
        },
        onSuccess: (view) => {
            invalidateLauncher();
            writeLauncherLastView(orgId, view.viewId);

            isApplyingUrlRef.current = true;
            setActiveViewId(view.viewId);
            setConfig(view.config);
            setSavedConfig(view.config);
            setSearchInput(view.config.query);
            setSearchQuery(view.config.query);
            isApplyingUrlRef.current = false;

            const params = serializeLauncherUrlState({
                viewId: view.viewId,
                config: view.config
            });
            router.replace(buildLauncherPath(orgId, params), { scroll: false });

            setSaveDialogOpen(false);
            setNewViewName("");
            toast({
                title: t("resourceLauncherViewSaved"),
                description: t("resourceLauncherViewSavedDescription")
            });
        },
        onError: (error) => {
            toast({
                variant: "destructive",
                title: t("resourceLauncherViewSaveFailed"),
                description: formatAxiosError(
                    error,
                    t("resourceLauncherViewSaveFailedDescription")
                )
            });
        }
    });

    const updateViewMutation = useMutation({
        mutationFn: async (payload: {
            viewId: number;
            name?: string;
            config?: LauncherViewConfig;
            orgWide?: boolean;
        }) => {
            const { viewId, ...body } = payload;
            const res = await api.put(
                `/org/${orgId}/launcher/views/${viewId}`,
                body
            );
            return res.data.data as LauncherViewRecord;
        },
        onSuccess: (view) => {
            invalidateLauncher();

            isApplyingUrlRef.current = true;
            setActiveViewId(view.viewId);
            setConfig(view.config);
            setSavedConfig(view.config);
            setSearchInput(view.config.query);
            setSearchQuery(view.config.query);
            isApplyingUrlRef.current = false;

            const params = serializeLauncherUrlState({
                viewId: view.viewId,
                config: view.config
            });
            router.replace(buildLauncherPath(orgId, params), { scroll: false });

            toast({
                title: t("resourceLauncherViewSaved"),
                description: t("resourceLauncherViewSavedDescription")
            });
        },
        onError: (error) => {
            toast({
                variant: "destructive",
                title: t("resourceLauncherViewSaveFailed"),
                description: formatAxiosError(
                    error,
                    t("resourceLauncherViewSaveFailedDescription")
                )
            });
        }
    });

    const deleteViewMutation = useMutation({
        mutationFn: async (viewId: number) => {
            await api.delete(`/org/${orgId}/launcher/views/${viewId}`);
        },
        onSuccess: () => {
            invalidateLauncher();
            selectView("default");
            toast({
                title: t("resourceLauncherViewDeleted"),
                description: t("resourceLauncherViewDeletedDescription")
            });
        },
        onError: (error) => {
            toast({
                variant: "destructive",
                title: t("resourceLauncherViewDeleteFailed"),
                description: formatAxiosError(
                    error,
                    t("resourceLauncherViewDeleteFailedDescription")
                )
            });
        }
    });

    const applyConfigPatch = useCallback(
        (patch: Partial<LauncherViewConfig>) => {
            const nextConfig = {
                ...configRef.current,
                ...patch,
                query: searchInputRef.current
            };
            syncUrl(activeViewIdRef.current, nextConfig);
        },
        [syncUrl]
    );

    const handleSaveToCurrent = () => {
        if (isDefaultView) {
            return;
        }
        updateViewMutation.mutate({
            viewId: activeViewId,
            config
        });
    };

    const handleSaveAsNew = () => {
        setSaveOrgWide(false);
        setNewViewName("");
        setSaveDialogOpen(true);
    };

    const handleSaveForEveryone = () => {
        if (isDefaultView) {
            return;
        }
        updateViewMutation.mutate({
            viewId: activeViewId,
            orgWide: true
        });
    };

    const handleMakePersonal = () => {
        if (isDefaultView) {
            return;
        }
        updateViewMutation.mutate({
            viewId: activeViewId,
            orgWide: false
        });
    };

    const handleCreateView = () => {
        if (!newViewName.trim()) {
            return;
        }
        createViewMutation.mutate({
            name: newViewName.trim(),
            config,
            orgWide: saveOrgWide && isAdmin
        });
    };

    return (
        <div className="flex flex-col">
            <SettingsSectionTitle
                title={t("resourceLauncherTitle")}
                description={t("resourceLauncherDescription")}
            />

            <div className="flex flex-col gap-3 mb-6">
                <div className="flex flex-col xl:flex-row xl:items-center gap-3 justify-between">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 min-w-0 flex-1">
                        <div className="relative w-full sm:max-w-sm shrink-0">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                            <Input
                                value={searchInput}
                                onChange={(event) => {
                                    const value = event.target.value;
                                    setSearchInput(value);
                                    debouncedSyncSearch(
                                        activeViewIdRef.current,
                                        value
                                    );
                                }}
                                placeholder={t(
                                    "resourceLauncherSearchPlaceholder"
                                )}
                                className="pl-8"
                            />
                        </div>
                        {!viewsLoading ? (
                            <LauncherViewTabs
                                activeViewId={activeViewId}
                                savedViews={views.map((view) => ({
                                    viewId: view.viewId,
                                    name: view.name
                                }))}
                                onSelectView={selectView}
                            />
                        ) : null}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 justify-end">
                        <LauncherSaveViewMenu
                            isDefaultView={isDefaultView}
                            isAdmin={isAdmin}
                            isOrgWideView={isOrgWideView}
                            hasUnsavedChanges={hasUnsavedChanges}
                            onSaveToCurrent={handleSaveToCurrent}
                            onSaveAsNew={handleSaveAsNew}
                            onSaveForEveryone={handleSaveForEveryone}
                            onMakePersonal={handleMakePersonal}
                        />
                        <LauncherFilterPopover
                            orgId={orgId}
                            selectedSites={selectedSites}
                            selectedLabels={selectedLabels}
                            onSitesChange={(sites) =>
                                applyConfigPatch({
                                    siteIds: sites.map((site) => site.siteId)
                                })
                            }
                            onLabelsChange={(labels) =>
                                applyConfigPatch({
                                    labelIds: labels.map(
                                        (label) => label.labelId
                                    )
                                })
                            }
                        />
                        <LauncherSortButton
                            order={config.order}
                            onToggle={() =>
                                applyConfigPatch({
                                    order:
                                        config.order === "asc" ? "desc" : "asc"
                                })
                            }
                        />
                        <LauncherSettingsMenu
                            config={config}
                            isDefaultView={isDefaultView}
                            onConfigChange={applyConfigPatch}
                            onDeleteView={() => {
                                if (!isDefaultView) {
                                    deleteViewMutation.mutate(activeViewId);
                                }
                            }}
                        />
                    </div>
                </div>
            </div>

            <LauncherGroupList
                orgId={orgId}
                activeViewId={activeViewId}
                config={{ ...config, query: searchQuery }}
                searchQuery={searchQuery}
            />

            <Credenza open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
                <CredenzaContent>
                    <CredenzaHeader>
                        <CredenzaTitle>
                            {t("resourceLauncherSaveAsNewView")}
                        </CredenzaTitle>
                        <CredenzaDescription>
                            {t("resourceLauncherSaveAsNewViewDescription")}
                        </CredenzaDescription>
                    </CredenzaHeader>
                    <CredenzaBody>
                        <div className="space-y-2">
                            <Label htmlFor="new-view-name">
                                {t("resourceLauncherViewNameLabel")}
                            </Label>
                            <Input
                                id="new-view-name"
                                value={newViewName}
                                onChange={(event) =>
                                    setNewViewName(event.target.value)
                                }
                            />
                        </div>
                        {isAdmin ? (
                            <div className="mt-4">
                                <CheckboxWithLabel
                                    id="save-org-wide"
                                    aria-describedby="save-org-wide-desc"
                                    label={t("resourceLauncherSaveForEveryone")}
                                    checked={saveOrgWide}
                                    onCheckedChange={(checked) =>
                                        setSaveOrgWide(checked === true)
                                    }
                                />
                                <p
                                    id="save-org-wide-desc"
                                    className="text-sm text-muted-foreground mt-2"
                                >
                                    {t(
                                        "resourceLauncherSaveForEveryoneDescription"
                                    )}
                                </p>
                            </div>
                        ) : null}
                    </CredenzaBody>
                    <CredenzaFooter>
                        <Button
                            variant="outline"
                            onClick={() => setSaveDialogOpen(false)}
                        >
                            {t("cancel")}
                        </Button>
                        <Button
                            onClick={handleCreateView}
                            loading={createViewMutation.isPending}
                        >
                            {t("save")}
                        </Button>
                    </CredenzaFooter>
                </CredenzaContent>
            </Credenza>
        </div>
    );
}
