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
import { getUserDisplayName } from "@app/lib/getUserDisplayName";
import { orgQueries, resourceQueries } from "@app/lib/queries";
import {
    ResourcePolicyContext,
    ResourcePolicyProvider
} from "@app/providers/ResourcePolicyProvider";
import { zodResolver } from "@hookform/resolvers/zod";
import { build } from "@server/build";
import { tierMatrix } from "@server/lib/billing/tierMatrix";
import { UserType } from "@server/types/UserTypes";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import SetResourcePasswordForm from "components/SetResourcePasswordForm";
import { Binary, Bot, InfoIcon, Key } from "lucide-react";
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

    if (pageLoading) {
        return <></>;
    }

    return (
        <>
            {isSetPasswordOpen && (
                <SetResourcePasswordForm
                    open={isSetPasswordOpen}
                    setOpen={setIsSetPasswordOpen}
                    resourceId={resource.resourceId}
                    onSetPassword={() => {
                        setIsSetPasswordOpen(false);
                        updateAuthInfo({
                            password: true
                        });
                    }}
                />
            )}

            {isSetPincodeOpen && (
                <SetResourcePincodeForm
                    open={isSetPincodeOpen}
                    setOpen={setIsSetPincodeOpen}
                    resourceId={resource.resourceId}
                    onSetPincode={() => {
                        setIsSetPincodeOpen(false);
                        updateAuthInfo({
                            pincode: true
                        });
                    }}
                />
            )}

            {isSetHeaderAuthOpen && (
                <SetResourceHeaderAuthForm
                    open={isSetHeaderAuthOpen}
                    setOpen={setIsSetHeaderAuthOpen}
                    resourceId={resource.resourceId}
                    onSetHeaderAuth={() => {
                        setIsSetHeaderAuthOpen(false);
                        updateAuthInfo({
                            headerAuth: true
                        });
                    }}
                />
            )}

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
                    </SettingsSectionBody>
                    <SettingsSectionFooter>
                        <Button
                            type="submit"
                            disabled
                            form="policies-type-form"
                        >
                            {t("resourceUsersRolesSubmit")}
                        </Button>
                    </SettingsSectionFooter>
                </SettingsSection>
                <ResourcePolicyProvider policy={defaultPolicy}>
                    <EditPolicyForm hidePolicyNameForm />
                </ResourcePolicyProvider>
            </SettingsContainer>
        </>
    );
}
