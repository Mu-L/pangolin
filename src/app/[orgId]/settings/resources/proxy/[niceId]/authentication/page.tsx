"use client";

import ActionBanner from "@app/components/ActionBanner";
import { EditPolicyForm } from "@app/components/resource-policy/EditPolicyForm";
import { RolesSelector } from "@app/components/roles-selector";
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
import { UsersSelector } from "@app/components/users-selector";
import type { ResourceContextType } from "@app/contexts/resourceContext";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useOrgContext } from "@app/hooks/useOrgContext";
import { usePaidStatus } from "@app/hooks/usePaidStatus";
import { useResourceContext } from "@app/hooks/useResourceContext";
import { toast } from "@app/hooks/useToast";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { cn } from "@app/lib/cn";
import { getUserDisplayName } from "@app/lib/getUserDisplayName";
import { orgQueries, resourceQueries } from "@app/lib/queries";
import { ResourcePolicyProvider } from "@app/providers/ResourcePolicyProvider";
import { zodResolver } from "@hookform/resolvers/zod";
import { CaretSortIcon } from "@radix-ui/react-icons";
import { build } from "@server/build";
import { tierMatrix, TierFeature } from "@server/lib/billing/tierMatrix";
import { UserType } from "@server/types/UserTypes";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import SetResourcePasswordForm from "components/SetResourcePasswordForm";
import {
    ArrowRightIcon,
    Binary,
    Bot,
    CheckIcon,
    InfoIcon,
    Key,
    ShieldAlertIcon
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
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

const UsersRolesFormSchema = z.object({
    roles: z.array(
        z.object({
            id: z.string(),
            text: z.string()
        })
    ),
    users: z.array(
        z.object({
            id: z.string(),
            text: z.string()
        })
    )
});

const whitelistSchema = z.object({
    emails: z.array(
        z.object({
            id: z.string(),
            text: z.string()
        })
    )
});

export default function ResourceAuthenticationPage() {
    const { org } = useOrgContext();
    const { resource, updateResource, authInfo, updateAuthInfo } =
        useResourceContext();
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

    const { data: resourceRoles = [], isLoading: isLoadingResourceRoles } =
        useQuery(
            resourceQueries.resourceRoles({
                resourceId: resource.resourceId
            })
        );
    const { data: resourceUsers = [], isLoading: isLoadingResourceUsers } =
        useQuery(
            resourceQueries.resourceUsers({
                resourceId: resource.resourceId
            })
        );

    const { data: whitelist = [], isLoading: isLoadingWhiteList } = useQuery(
        resourceQueries.resourceWhitelist({
            resourceId: resource.resourceId
        })
    );

    const { data: orgRoles = [], isLoading: isLoadingOrgRoles } = useQuery(
        orgQueries.roles({
            orgId: org.org.orgId
        })
    );
    const { data: orgUsers = [], isLoading: isLoadingOrgUsers } = useQuery(
        orgQueries.users({
            orgId: org.org.orgId
        })
    );
    const { data: orgIdps = [], isLoading: isLoadingOrgIdps } = useQuery({
        ...orgQueries.identityProviders({
            orgId: org.org.orgId,
            useOrgOnlyIdp: env.app.identityProviderMode === "org"
        })
    });

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

    const allIdps = useMemo(() => {
        if (build === "saas") {
            if (isPaidUser(tierMatrix.orgOidc)) {
                return orgIdps.map((idp) => ({
                    id: idp.idpId,
                    text: idp.name
                }));
            }
        } else {
            return orgIdps.map((idp) => ({
                id: idp.idpId,
                text: idp.name
            }));
        }
        return [];
    }, [orgIdps]);

    const [ssoEnabled, setSsoEnabled] = useState(resource.sso ?? false);

    useEffect(() => {
        setSsoEnabled(resource.sso ?? false);
    }, [resource.sso]);

    const [selectedIdpId, setSelectedIdpId] = useState<number | null>(
        resource.skipToIdpId || null
    );

    const [loadingRemoveResourcePassword, setLoadingRemoveResourcePassword] =
        useState(false);
    const [loadingRemoveResourcePincode, setLoadingRemoveResourcePincode] =
        useState(false);
    const [
        loadingRemoveResourceHeaderAuth,
        setLoadingRemoveResourceHeaderAuth
    ] = useState(false);

    const [isSetPasswordOpen, setIsSetPasswordOpen] = useState(false);
    const [isSetPincodeOpen, setIsSetPincodeOpen] = useState(false);
    const [isSetHeaderAuthOpen, setIsSetHeaderAuthOpen] = useState(false);

    const usersRolesForm = useForm({
        resolver: zodResolver(UsersRolesFormSchema),
        defaultValues: { roles: [], users: [] }
    });

    const whitelistForm = useForm({
        resolver: zodResolver(whitelistSchema),
        defaultValues: { emails: [] }
    });

    const hasInitializedRef = useRef(false);

    useEffect(() => {
        if (!isLoadingPolicies && policies?.sharedPolicy) {
            setSelectedPolicy({
                id: policies?.sharedPolicy.resourcePolicyId,
                name: policies?.sharedPolicy.name
            });
        }
    }, [isLoadingPolicies, policies?.sharedPolicy]);

    const pageLoading =
        isLoadingPolicies ||
        !policies ||
        isLoadingOrgRoles ||
        isLoadingOrgUsers ||
        isLoadingResourceRoles ||
        isLoadingResourceUsers ||
        isLoadingWhiteList ||
        isLoadingOrgIdps;

    useEffect(() => {
        if (pageLoading || hasInitializedRef.current) return;

        usersRolesForm.setValue(
            "roles",
            resourceRoles
                .map((i) => ({
                    id: i.roleId.toString(),
                    text: i.name
                }))
                .filter((role) => role.text !== "Admin")
        );
        usersRolesForm.setValue(
            "users",
            resourceUsers.map((i) => ({
                id: i.userId.toString(),
                text: `${getUserDisplayName({
                    email: i.email,
                    username: i.username
                })}${i.type !== UserType.Internal ? ` (${i.idpName})` : ""}`
            }))
        );

        whitelistForm.setValue(
            "emails",
            whitelist.map((w) => ({
                id: w.email,
                text: w.email
            }))
        );
        hasInitializedRef.current = true;
    }, [pageLoading, resourceRoles, resourceUsers, whitelist, orgIdps]);

    const [, submitUserRolesForm, loadingSaveUsersRoles] = useActionState(
        onSubmitUsersRoles,
        null
    );

    const [isUpdatingResource, startTransitionPolicy] = useTransition();

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

    async function onSubmitUsersRoles() {
        const isValid = usersRolesForm.trigger();
        if (!isValid) return;

        const data = usersRolesForm.getValues();

        try {
            const jobs = [
                api.post(`/resource/${resource.resourceId}/roles`, {
                    roleIds: data.roles.map((i) => parseInt(i.id))
                }),
                api.post(`/resource/${resource.resourceId}/users`, {
                    userIds: data.users.map((i) => i.id)
                }),
                api.post(`/resource/${resource.resourceId}`, {
                    sso: ssoEnabled,
                    skipToIdpId: selectedIdpId
                })
            ];

            await Promise.all(jobs);

            updateResource({
                sso: ssoEnabled,
                skipToIdpId: selectedIdpId
            });

            updateAuthInfo({
                sso: ssoEnabled
            });

            toast({
                title: t("resourceAuthSettingsSave"),
                description: t("resourceAuthSettingsSaveDescription")
            });
            await queryClient.invalidateQueries(
                resourceQueries.resourceUsers({
                    resourceId: resource.resourceId
                })
            );
            await queryClient.invalidateQueries(
                resourceQueries.resourceRoles({
                    resourceId: resource.resourceId
                })
            );

            router.refresh();
        } catch (e) {
            console.error(e);
            toast({
                variant: "destructive",
                title: t("resourceErrorUsersRolesSave"),
                description: formatAxiosError(
                    e,
                    t("resourceErrorUsersRolesSaveDescription")
                )
            });
        }
    }

    function removeResourcePassword() {
        setLoadingRemoveResourcePassword(true);

        api.post(`/resource/${resource.resourceId}/password`, {
            password: null
        })
            .then(() => {
                toast({
                    title: t("resourcePasswordRemove"),
                    description: t("resourcePasswordRemoveDescription")
                });

                updateAuthInfo({
                    password: false
                });
                router.refresh();
            })
            .catch((e) => {
                toast({
                    variant: "destructive",
                    title: t("resourceErrorPasswordRemove"),
                    description: formatAxiosError(
                        e,
                        t("resourceErrorPasswordRemoveDescription")
                    )
                });
            })
            .finally(() => setLoadingRemoveResourcePassword(false));
    }

    function removeResourcePincode() {
        setLoadingRemoveResourcePincode(true);

        api.post(`/resource/${resource.resourceId}/pincode`, {
            pincode: null
        })
            .then(() => {
                toast({
                    title: t("resourcePincodeRemove"),
                    description: t("resourcePincodeRemoveDescription")
                });

                updateAuthInfo({
                    pincode: false
                });
                router.refresh();
            })
            .catch((e) => {
                toast({
                    variant: "destructive",
                    title: t("resourceErrorPincodeRemove"),
                    description: formatAxiosError(
                        e,
                        t("resourceErrorPincodeRemoveDescription")
                    )
                });
            })
            .finally(() => setLoadingRemoveResourcePincode(false));
    }

    function removeResourceHeaderAuth() {
        setLoadingRemoveResourceHeaderAuth(true);

        api.post(`/resource/${resource.resourceId}/header-auth`, {
            user: null,
            password: null,
            extendedCompatibility: null
        })
            .then(() => {
                toast({
                    title: t("resourceHeaderAuthRemove"),
                    description: t("resourceHeaderAuthRemoveDescription")
                });

                updateAuthInfo({
                    headerAuth: false
                });
                router.refresh();
            })
            .catch((e) => {
                toast({
                    variant: "destructive",
                    title: t("resourceErrorHeaderAuthRemove"),
                    description: formatAxiosError(
                        e,
                        t("resourceErrorHeaderAuthRemoveDescription")
                    )
                });
            })
            .finally(() => setLoadingRemoveResourceHeaderAuth(false));
    }

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
                                        startTransitionPolicy(
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

                <SettingsSection>
                    <SettingsSectionHeader>
                        <SettingsSectionTitle>
                            {t("resourceUsersRoles")}
                        </SettingsSectionTitle>
                        <SettingsSectionDescription>
                            {t("resourceUsersRolesDescription")}
                        </SettingsSectionDescription>
                    </SettingsSectionHeader>
                    <SettingsSectionBody>
                        <SettingsSectionForm>
                            <SwitchInput
                                id="sso-toggle"
                                label={t("ssoUse")}
                                checked={ssoEnabled}
                                onCheckedChange={(val) => setSsoEnabled(val)}
                            />

                            <Form {...usersRolesForm}>
                                <form
                                    action={submitUserRolesForm}
                                    id="users-roles-form"
                                    className="space-y-4"
                                >
                                    {ssoEnabled && (
                                        <>
                                            <FormField
                                                control={usersRolesForm.control}
                                                name="roles"
                                                render={({ field }) => (
                                                    <FormItem className="flex flex-col items-start">
                                                        <FormLabel>
                                                            {t("roles")}
                                                        </FormLabel>
                                                        <FormControl>
                                                            <RolesSelector
                                                                selectedRoles={
                                                                    field.value ??
                                                                    []
                                                                }
                                                                restrictAdminRole
                                                                orgId={
                                                                    org.org
                                                                        .orgId
                                                                }
                                                                onSelectRoles={(
                                                                    newUsers
                                                                ) => {
                                                                    usersRolesForm.setValue(
                                                                        "roles",
                                                                        newUsers as [
                                                                            Tag,
                                                                            ...Tag[]
                                                                        ]
                                                                    );
                                                                }}
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                        <FormDescription>
                                                            {t(
                                                                "resourceRoleDescription"
                                                            )}
                                                        </FormDescription>
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={usersRolesForm.control}
                                                name="users"
                                                render={({ field }) => (
                                                    <FormItem className="flex flex-col items-start">
                                                        <FormLabel>
                                                            {t("users")}
                                                        </FormLabel>
                                                        <FormControl>
                                                            <UsersSelector
                                                                selectedUsers={
                                                                    field.value ??
                                                                    []
                                                                }
                                                                orgId={
                                                                    org.org
                                                                        .orgId
                                                                }
                                                                onSelectUsers={(
                                                                    newUsers
                                                                ) => {
                                                                    usersRolesForm.setValue(
                                                                        "users",
                                                                        newUsers as [
                                                                            Tag,
                                                                            ...Tag[]
                                                                        ]
                                                                    );
                                                                }}
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </>
                                    )}

                                    {ssoEnabled && allIdps.length > 0 && (
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">
                                                {t("defaultIdentityProvider")}
                                            </label>
                                            <Select
                                                onValueChange={(value) => {
                                                    if (value === "none") {
                                                        setSelectedIdpId(null);
                                                    } else {
                                                        setSelectedIdpId(
                                                            parseInt(value)
                                                        );
                                                    }
                                                }}
                                                value={
                                                    selectedIdpId
                                                        ? selectedIdpId.toString()
                                                        : "none"
                                                }
                                            >
                                                <SelectTrigger className="w-full mt-1">
                                                    <SelectValue
                                                        placeholder={t(
                                                            "selectIdpPlaceholder"
                                                        )}
                                                    />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none">
                                                        {t("none")}
                                                    </SelectItem>
                                                    {allIdps.map((idp) => (
                                                        <SelectItem
                                                            key={idp.id}
                                                            value={idp.id.toString()}
                                                        >
                                                            {idp.text}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <p className="text-sm text-muted-foreground">
                                                {t(
                                                    "defaultIdentityProviderDescription"
                                                )}
                                            </p>
                                        </div>
                                    )}
                                </form>
                            </Form>
                        </SettingsSectionForm>
                    </SettingsSectionBody>
                    <SettingsSectionFooter>
                        <Button
                            type="submit"
                            loading={loadingSaveUsersRoles}
                            disabled={loadingSaveUsersRoles}
                            form="users-roles-form"
                        >
                            {t("resourceUsersRolesSubmit")}
                        </Button>
                    </SettingsSectionFooter>
                </SettingsSection>

                <SettingsSection>
                    <SettingsSectionHeader>
                        <SettingsSectionTitle>
                            {t("resourceAuthMethods")}
                        </SettingsSectionTitle>
                        <SettingsSectionDescription>
                            {t("resourceAuthMethodsDescriptions")}
                        </SettingsSectionDescription>
                    </SettingsSectionHeader>
                    <SettingsSectionBody>
                        <SettingsSectionForm>
                            {/* Password Protection */}
                            <div className="flex items-center justify-between border rounded-md p-2 mb-4">
                                <div
                                    className={`flex items-center ${!authInfo.password ? "" : "text-green-500"} text-sm space-x-2`}
                                >
                                    <Key size="14" />
                                    <span>
                                        {t("resourcePasswordProtection", {
                                            status: authInfo.password
                                                ? t("enabled")
                                                : t("disabled")
                                        })}
                                    </span>
                                </div>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={
                                        authInfo.password
                                            ? removeResourcePassword
                                            : () => setIsSetPasswordOpen(true)
                                    }
                                    loading={loadingRemoveResourcePassword}
                                >
                                    {authInfo.password
                                        ? t("passwordRemove")
                                        : t("passwordAdd")}
                                </Button>
                            </div>

                            {/* PIN Code Protection */}
                            <div className="flex items-center justify-between border rounded-md p-2">
                                <div
                                    className={`flex items-center ${!authInfo.pincode ? "" : "text-green-500"} space-x-2 text-sm`}
                                >
                                    <Binary size="14" />
                                    <span>
                                        {t("resourcePincodeProtection", {
                                            status: authInfo.pincode
                                                ? t("enabled")
                                                : t("disabled")
                                        })}
                                    </span>
                                </div>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={
                                        authInfo.pincode
                                            ? removeResourcePincode
                                            : () => setIsSetPincodeOpen(true)
                                    }
                                    loading={loadingRemoveResourcePincode}
                                >
                                    {authInfo.pincode
                                        ? t("pincodeRemove")
                                        : t("pincodeAdd")}
                                </Button>
                            </div>

                            {/* Header Authentication Protection */}
                            <div className="flex items-center justify-between border rounded-md p-2">
                                <div
                                    className={`flex items-center ${!authInfo.headerAuth ? "" : "text-green-500"} space-x-2 text-sm`}
                                >
                                    <Bot size="14" />
                                    <span>
                                        {authInfo.headerAuth
                                            ? t(
                                                  "resourceHeaderAuthProtectionEnabled"
                                              )
                                            : t(
                                                  "resourceHeaderAuthProtectionDisabled"
                                              )}
                                    </span>
                                </div>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={
                                        authInfo.headerAuth
                                            ? removeResourceHeaderAuth
                                            : () => setIsSetHeaderAuthOpen(true)
                                    }
                                    loading={loadingRemoveResourceHeaderAuth}
                                >
                                    {authInfo.headerAuth
                                        ? t("headerAuthRemove")
                                        : t("headerAuthAdd")}
                                </Button>
                            </div>
                        </SettingsSectionForm>
                    </SettingsSectionBody>
                </SettingsSection>

                <OneTimePasswordFormSection
                    resource={resource}
                    updateResource={updateResource}
                    whitelist={whitelist}
                    isLoadingWhiteList={isLoadingWhiteList}
                />

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
                            <ActionBanner
                                variant="warning"
                                title={t("resourcePolicyReadOnly")}
                                titleIcon={
                                    <ShieldAlertIcon className="w-5 h-5" />
                                }
                                description={t(
                                    "resourcePolicyReadOnlyDescription"
                                )}
                                actions={
                                    <Button
                                        variant="outline"
                                        className="gap-2"
                                        asChild
                                    >
                                        <Link
                                            href={`/${org.org.orgId}/settings/policies/resource/${policies.sharedPolicy.niceId}`}
                                        >
                                            {t("edit")}
                                            <ArrowRightIcon className="size-4" />
                                        </Link>
                                    </Button>
                                }
                            />
                            <EditPolicyForm readonly />
                        </ResourcePolicyProvider>
                    )
                )}
            </SettingsContainer>
        </>
    );
}

type OneTimePasswordFormSectionProps = Pick<
    ResourceContextType,
    "resource" | "updateResource"
> & {
    whitelist: Array<{ email: string }>;
    isLoadingWhiteList: boolean;
};

function OneTimePasswordFormSection({
    resource,
    updateResource,
    whitelist,
    isLoadingWhiteList
}: OneTimePasswordFormSectionProps) {
    const { env } = useEnvContext();
    const [whitelistEnabled, setWhitelistEnabled] = useState(
        resource.emailWhitelistEnabled ?? false
    );

    useEffect(() => {
        setWhitelistEnabled(resource.emailWhitelistEnabled);
    }, [resource.emailWhitelistEnabled]);

    const queryClient = useQueryClient();

    const [loadingSaveWhitelist, startTransition] = useTransition();
    const whitelistForm = useForm({
        resolver: zodResolver(whitelistSchema),
        defaultValues: { emails: [] }
    });
    const api = createApiClient({ env });
    const router = useRouter();
    const t = useTranslations();

    const [activeEmailTagIndex, setActiveEmailTagIndex] = useState<
        number | null
    >(null);

    useEffect(() => {
        if (isLoadingWhiteList) return;

        whitelistForm.setValue(
            "emails",
            whitelist.map((w) => ({
                id: w.email,
                text: w.email
            }))
        );
    }, [isLoadingWhiteList, whitelist, whitelistForm]);

    async function saveWhitelist() {
        try {
            await api.post(`/resource/${resource.resourceId}`, {
                emailWhitelistEnabled: whitelistEnabled
            });

            if (whitelistEnabled) {
                await api.post(`/resource/${resource.resourceId}/whitelist`, {
                    emails: whitelistForm.getValues().emails.map((i) => i.text)
                });
            }

            updateResource({
                emailWhitelistEnabled: whitelistEnabled
            });

            toast({
                title: t("resourceWhitelistSave"),
                description: t("resourceWhitelistSaveDescription")
            });
            router.refresh();
            await queryClient.invalidateQueries(
                resourceQueries.resourceWhitelist({
                    resourceId: resource.resourceId
                })
            );
        } catch (e) {
            console.error(e);
            toast({
                variant: "destructive",
                title: t("resourceErrorWhitelistSave"),
                description: formatAxiosError(
                    e,
                    t("resourceErrorWhitelistSaveDescription")
                )
            });
        }
    }

    return (
        <SettingsSection>
            <SettingsSectionHeader>
                <SettingsSectionTitle>
                    {t("otpEmailTitle")}
                </SettingsSectionTitle>
                <SettingsSectionDescription>
                    {t("otpEmailTitleDescription")}
                </SettingsSectionDescription>
            </SettingsSectionHeader>
            <SettingsSectionBody>
                <SettingsSectionForm>
                    {!env.email.emailEnabled && (
                        <Alert variant="neutral" className="mb-4">
                            <InfoIcon className="h-4 w-4" />
                            <AlertTitle className="font-semibold">
                                {t("otpEmailSmtpRequired")}
                            </AlertTitle>
                            <AlertDescription>
                                {t("otpEmailSmtpRequiredDescription")}
                            </AlertDescription>
                        </Alert>
                    )}
                    <SwitchInput
                        id="whitelist-toggle"
                        label={t("otpEmailWhitelist")}
                        checked={whitelistEnabled}
                        onCheckedChange={setWhitelistEnabled}
                        disabled={!env.email.emailEnabled}
                    />

                    {whitelistEnabled && env.email.emailEnabled && (
                        <Form {...whitelistForm}>
                            <form id="whitelist-form">
                                <FormField
                                    control={whitelistForm.control}
                                    name="emails"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                <InfoPopup
                                                    text={t(
                                                        "otpEmailWhitelistList"
                                                    )}
                                                    info={t(
                                                        "otpEmailWhitelistListDescription"
                                                    )}
                                                />
                                            </FormLabel>
                                            <FormControl>
                                                {/* @ts-ignore */}
                                                <TagInput
                                                    {...field}
                                                    activeTagIndex={
                                                        activeEmailTagIndex
                                                    }
                                                    size={"sm"}
                                                    validateTag={(tag) => {
                                                        return z
                                                            .email()
                                                            .or(
                                                                z
                                                                    .string()
                                                                    .regex(
                                                                        /^\*@[\w.-]+\.[a-zA-Z]{2,}$/,
                                                                        {
                                                                            message:
                                                                                t(
                                                                                    "otpEmailErrorInvalid"
                                                                                )
                                                                        }
                                                                    )
                                                            )
                                                            .safeParse(tag)
                                                            .success;
                                                    }}
                                                    setActiveTagIndex={
                                                        setActiveEmailTagIndex
                                                    }
                                                    placeholder={t(
                                                        "otpEmailEnter"
                                                    )}
                                                    tags={
                                                        whitelistForm.getValues()
                                                            .emails
                                                    }
                                                    setTags={(newRoles) => {
                                                        whitelistForm.setValue(
                                                            "emails",
                                                            newRoles as [
                                                                Tag,
                                                                ...Tag[]
                                                            ]
                                                        );
                                                    }}
                                                    allowDuplicates={false}
                                                    sortTags={true}
                                                />
                                            </FormControl>
                                            <FormDescription>
                                                {t("otpEmailEnterDescription")}
                                            </FormDescription>
                                        </FormItem>
                                    )}
                                />
                            </form>
                        </Form>
                    )}
                </SettingsSectionForm>
            </SettingsSectionBody>
            <SettingsSectionFooter>
                <Button
                    onClick={() => startTransition(saveWhitelist)}
                    form="whitelist-form"
                    loading={loadingSaveWhitelist}
                    disabled={loadingSaveWhitelist}
                >
                    {t("otpEmailWhitelistSave")}
                </Button>
            </SettingsSectionFooter>
        </SettingsSection>
    );
}
