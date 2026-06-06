"use client";

import { EditPolicyForm } from "@app/components/resource-policy/EditPolicyForm";
import {
    SettingsContainer,
    SettingsSection,
    SettingsSectionBody,
    SettingsSectionDescription,
    SettingsSectionFooter,
    SettingsSectionHeader,
    SettingsSectionTitle
} from "@app/components/Settings";
import {
    StrategySelect,
    type StrategyOption
} from "@app/components/StrategySelect";
import { Button } from "@app/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList
} from "@app/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@app/components/ui/popover";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useOrgContext } from "@app/hooks/useOrgContext";
import { usePaidStatus } from "@app/hooks/usePaidStatus";
import { useResourceContext } from "@app/hooks/useResourceContext";
import { toast } from "@app/hooks/useToast";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { cn } from "@app/lib/cn";
import { orgQueries, resourceQueries } from "@app/lib/queries";
import { ResourcePolicyProvider } from "@app/providers/ResourcePolicyProvider";
import { zodResolver } from "@hookform/resolvers/zod";
import { CaretSortIcon } from "@radix-ui/react-icons";
import { build } from "@server/build";
import { tierMatrix, TierFeature } from "@server/lib/billing/tierMatrix";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import SetResourcePasswordForm from "@app/components/SetResourcePasswordForm";
import { Binary, Bot, InfoIcon, Key } from "lucide-react";
import { CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

const resourceTypeSchema = z
    .object({
        type: z.literal("inline")
    })
    .or(
        z.object({
            type: z.literal("shared"),
            resourcePolicyId: z.number()
        })
    );

type ResourcePolicyType = StrategyOption<"inline" | "shared">;

export default function ResourceAuthenticationPage() {
    const { org } = useOrgContext();
    const { resource, updateResource } = useResourceContext();
    const queryClient = useQueryClient();

    const { env } = useEnvContext();
    const { isPaidUser } = usePaidStatus();

    const api = createApiClient({ env });
    const router = useRouter();
    const t = useTranslations();

    const { data: policies, isLoading: isLoadingPolicies } = useQuery(
        resourceQueries.policies({
            resourceId: resource.resourceId
        })
    );

    const form = useForm({
        resolver: zodResolver(resourceTypeSchema),
        defaultValues: {
            type:
                build !== "oss" && resource.resourcePolicyId
                    ? "shared"
                    : "inline"
        }
    });

    const selectedResourceType = useWatch({
        control: form.control,
        name: "type"
    });

    const [resourcePolicysearchQuery, setResourcePolicySearchQuery] =
        useState("");

    const { data: policiesList = [] } = useQuery({
        ...orgQueries.policies({
            orgId: org.org.orgId,
            name: resourcePolicysearchQuery
        }),
        enabled: selectedResourceType === "shared"
    });

    const [selectedPolicy, setSelectedPolicy] = useState<{
        name: string;
        id: number;
    } | null>(null);

    const resourcePolicyTypes: Array<ResourcePolicyType> = [
        {
            id: "inline",
            title: t("resourcePolicyInline"),
            description: t("resourcePolicyInlineDescription")
        },
        {
            id: "shared",
            title: t("resourcePolicyShared"),
            description: t("resourcePolicySharedDescription")
        }
    ];

    useEffect(() => {
        if (!isLoadingPolicies && policies?.sharedPolicy) {
            setSelectedPolicy({
                id: policies?.sharedPolicy.resourcePolicyId,
                name: policies?.sharedPolicy.name
            });
        }
    }, [isLoadingPolicies, policies?.sharedPolicy]);

    const [isUpdatingResource, startTransition] = useTransition();

    async function handleSaveResourcePolicyType() {
        try {
            if (selectedResourceType === "inline") {
                await api.post(`/resource/${resource.resourceId}`, {
                    resourcePolicyId: null
                });
            } else {
                if (!selectedPolicy) {
                    toast({
                        title: t("error"),
                        description: t("resourcePolicySelectError"),
                        variant: "destructive"
                    });
                    return;
                }
                await api.post(`/resource/${resource.resourceId}`, {
                    resourcePolicyId: selectedPolicy.id
                });
            }
            router.refresh();
            toast({
                title: t("resourceUpdated"),
                description: t("resourceUpdatedDescription")
            });
        } catch (e) {
            toast({
                title: t("error"),
                description: formatAxiosError(e),
                variant: "destructive"
            });
        } finally {
            await queryClient.invalidateQueries(
                resourceQueries.policies({
                    resourceId: resource.resourceId
                })
            );
        }
    }

    const pageLoading = isLoadingPolicies || !policies;

    if (pageLoading) {
        return <></>;
    }

    return (
        <>
            <SettingsContainer>
                {build !== "oss" &&
                    isPaidUser(tierMatrix[TierFeature.ResourcePolicies]) && (
                        <SettingsSection>
                            <SettingsSectionHeader>
                                <SettingsSectionTitle>
                                    {t("resourcePolicySelectTitle")}
                                </SettingsSectionTitle>
                                <SettingsSectionDescription>
                                    {t("resourcePolicySelectDescription")}
                                </SettingsSectionDescription>
                            </SettingsSectionHeader>
                            <SettingsSectionBody>
                                <StrategySelect
                                    options={resourcePolicyTypes}
                                    value={selectedResourceType}
                                    onChange={(value) => {
                                        form.setValue("type", value);
                                    }}
                                    cols={2}
                                />
                                {selectedResourceType === "shared" && (
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                role="combobox"
                                                className={
                                                    "w-full md:w-1/2 justify-between"
                                                }
                                            >
                                                <span className="truncate max-w-37.5">
                                                    {selectedPolicy
                                                        ? selectedPolicy.name
                                                        : t(
                                                              "resourcePolicySelect"
                                                          )}
                                                </span>
                                                <CaretSortIcon className="ml-2h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="p-0 w-45">
                                            <Command shouldFilter={false}>
                                                <CommandInput
                                                    placeholder={t(
                                                        "resourcePolicySearch"
                                                    )}
                                                    value={
                                                        resourcePolicysearchQuery
                                                    }
                                                    onValueChange={
                                                        setResourcePolicySearchQuery
                                                    }
                                                />
                                                <CommandList>
                                                    <CommandEmpty>
                                                        {t(
                                                            "resourcePolicyNotFound"
                                                        )}
                                                    </CommandEmpty>
                                                    <CommandGroup>
                                                        {policiesList.map(
                                                            (policy) => (
                                                                <CommandItem
                                                                    key={
                                                                        policy.resourcePolicyId
                                                                    }
                                                                    value={policy.resourcePolicyId.toString()}
                                                                    onSelect={() =>
                                                                        setSelectedPolicy(
                                                                            {
                                                                                id: policy.resourcePolicyId,
                                                                                name: policy.name
                                                                            }
                                                                        )
                                                                    }
                                                                >
                                                                    <CheckIcon
                                                                        className={cn(
                                                                            "mr-2 h-4 w-4",
                                                                            policy.resourcePolicyId ===
                                                                                selectedPolicy?.id
                                                                                ? "opacity-100"
                                                                                : "opacity-0"
                                                                        )}
                                                                    />
                                                                    {
                                                                        policy.name
                                                                    }
                                                                </CommandItem>
                                                            )
                                                        )}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                )}
                            </SettingsSectionBody>
                            <SettingsSectionFooter className="justify-start">
                                <Button
                                    onClick={() =>
                                        startTransition(
                                            handleSaveResourcePolicyType
                                        )
                                    }
                                    loading={isUpdatingResource}
                                >
                                    {t("resourcePolicyTypeSave")}
                                </Button>
                            </SettingsSectionFooter>
                        </SettingsSection>
                    )}

                {selectedResourceType === "inline" ? (
                    <ResourcePolicyProvider policy={policies.defaultPolicy}>
                        <EditPolicyForm hidePolicyNameForm />
                    </ResourcePolicyProvider>
                ) : (
                    policies.sharedPolicy && (
                        <ResourcePolicyProvider
                            policy={policies.sharedPolicy}
                            key={policies.sharedPolicy.resourcePolicyId}
                        >
                            <EditPolicyForm
                                resourceId={resource.resourceId}
                            />
                        </ResourcePolicyProvider>
                    )
                )}
            </SettingsContainer>
        </>
    );
}
