"use client";

import { EditPolicyForm } from "@app/components/resource-policy/EditPolicyForm";
import SetResourceHeaderAuthForm from "@app/components/SetResourceHeaderAuthForm";
import SetResourcePincodeForm from "@app/components/SetResourcePincodeForm";
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
import {
    StrategySelect,
    type StrategyOption
} from "@app/components/StrategySelect";
import { SwitchInput } from "@app/components/SwitchInput";
import { Tag, TagInput } from "@app/components/tags/tag-input";
import { Alert, AlertDescription, AlertTitle } from "@app/components/ui/alert";
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
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@app/components/ui/form";
import { InfoPopup } from "@app/components/ui/info-popup";
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@app/components/ui/popover";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@app/components/ui/select";
import type { ResourceContextType } from "@app/contexts/resourceContext";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useOrgContext } from "@app/hooks/useOrgContext";
import { usePaidStatus } from "@app/hooks/usePaidStatus";
import { useResourceContext } from "@app/hooks/useResourceContext";
import { toast } from "@app/hooks/useToast";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { cn } from "@app/lib/cn";
import { getUserDisplayName } from "@app/lib/getUserDisplayName";
import {
    orgQueries,
    resourcePolicyQueries,
    resourceQueries
} from "@app/lib/queries";
import {
    ResourcePolicyContext,
    ResourcePolicyProvider
} from "@app/providers/ResourcePolicyProvider";
import { zodResolver } from "@hookform/resolvers/zod";
import { CaretSortIcon } from "@radix-ui/react-icons";
import { build } from "@server/build";
import { tierMatrix } from "@server/lib/billing/tierMatrix";
import { UserType } from "@server/types/UserTypes";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import SetResourcePasswordForm from "components/SetResourcePasswordForm";
import { Binary, Bot, CheckIcon, InfoIcon, Key } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
    useActionState,
    useEffect,
    useMemo,
    useRef,
    useState,
    useTransition
} from "react";
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
    const { resource, updateResource, authInfo, updateAuthInfo } =
        useResourceContext();

    const { env } = useEnvContext();

    const api = createApiClient({ env });
    const router = useRouter();
    const t = useTranslations();

    const { isPaidUser } = usePaidStatus();

    const { data: defaultPolicy, isLoading: isLoadingPolicies } = useQuery(
        resourceQueries.defaultPolicy({
            resourceId: resource.resourceId
        })
    );

    const form = useForm({
        resolver: zodResolver(resourceTypeSchema),
        defaultValues: {
            type: "inline"
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

    const { data: sharedPolicy } = useQuery({
        ...resourcePolicyQueries.single({
            resourcePolicyId: resource.resourcePolicyId ?? 1
        }),
        enabled: !!resource.resourcePolicyId
    });

    const [selectedPolicy, setSelectedPolicy] = useState<{
        name: string;
        id: number;
    } | null>(null);

    const pageLoading = isLoadingPolicies || !defaultPolicy;

    const [
        loadingRemoveResourceHeaderAuth,
        setLoadingRemoveResourceHeaderAuth
    ] = useState(false);

    const [isSetPasswordOpen, setIsSetPasswordOpen] = useState(false);
    const [isSetPincodeOpen, setIsSetPincodeOpen] = useState(false);
    const [isSetHeaderAuthOpen, setIsSetHeaderAuthOpen] = useState(false);

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

    if (pageLoading) {
        return <></>;
    }

    return (
        <>
            <SettingsContainer>
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
                                            // "w-45 justify-between text-sm border-r pr-4 rounded-none h-8 hover:bg-transparent",
                                            // "rounded-l-md rounded-r-xs"
                                            // !proxyTarget.siteId && "text-muted-foreground"
                                        }
                                    >
                                        <span className="truncate max-w-37.5">
                                            {selectedPolicy
                                                ? selectedPolicy.name
                                                : t("resourcePolicySelect")}
                                        </span>
                                        <CaretSortIcon className="ml-2h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="p-0 w-45">
                                    <Command shouldFilter={false}>
                                        <CommandInput
                                            placeholder={t("siteSearch")}
                                            value={resourcePolicysearchQuery}
                                            onValueChange={
                                                setResourcePolicySearchQuery
                                            }
                                        />
                                        <CommandList>
                                            <CommandEmpty>
                                                {t("siteNotFound")}
                                            </CommandEmpty>
                                            <CommandGroup>
                                                {policiesList.map((policy) => (
                                                    <CommandItem
                                                        key={
                                                            policy.resourcePolicyId
                                                        }
                                                        value={policy.resourcePolicyId.toString()}
                                                        onSelect={() =>
                                                            setSelectedPolicy({
                                                                id: policy.resourcePolicyId,
                                                                name: policy.name
                                                            })
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
                                                        {policy.name}
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        )}
                    </SettingsSectionBody>
                    <SettingsSectionFooter className="justify-start">
                        <Button
                            onClick={() => {
                                //...
                            }}
                        >
                            {t("resourcePolicyTypeSave")}
                        </Button>
                    </SettingsSectionFooter>
                </SettingsSection>
                {selectedResourceType === "inline" ? (
                    <ResourcePolicyProvider policy={defaultPolicy}>
                        <EditPolicyForm hidePolicyNameForm />
                    </ResourcePolicyProvider>
                ) : (
                    sharedPolicy && (
                        <ResourcePolicyProvider policy={sharedPolicy}>
                            <EditPolicyForm readonly />
                        </ResourcePolicyProvider>
                    )
                )}
            </SettingsContainer>
        </>
    );
}
