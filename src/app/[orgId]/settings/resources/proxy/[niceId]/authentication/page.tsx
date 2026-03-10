"use client";

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
import { ResourcePolicyContext } from "@app/providers/ResourcePolicyProvider";
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
import { useForm } from "react-hook-form";
import { z } from "zod";

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

    const queryClient = useQueryClient();
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
    const { data: policies, isLoading: isLoadingPolicies } = useQuery(
        resourceQueries.policies({
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
    const { data: orgIdps = [], isLoading: isLoadingOrgIdps } = useQuery(
        orgQueries.identityProviders({
            orgId: org.org.orgId,
            useOrgOnlyIdp: env.app.identityProviderMode === "org"
        })
    );

    const pageLoading =
        isLoadingOrgRoles ||
        isLoadingOrgUsers ||
        isLoadingResourceRoles ||
        isLoadingResourceUsers ||
        isLoadingWhiteList ||
        isLoadingOrgIdps ||
        isLoadingPolicies;

    const allRoles = useMemo(() => {
        return orgRoles
            .map((role) => ({
                id: role.roleId.toString(),
                text: role.name
            }))
            .filter((role) => role.text !== "Admin");
    }, [orgRoles]);

    const allUsers = useMemo(() => {
        return orgUsers.map((user) => ({
            id: user.id.toString(),
            text: `${getUserDisplayName({
                email: user.email,
                username: user.username
            })}${user.type !== UserType.Internal ? ` (${user.idpName})` : ""}`
        }));
    }, [orgUsers]);

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

    const [activeRolesTagIndex, setActiveRolesTagIndex] = useState<
        number | null
    >(null);
    const [activeUsersTagIndex, setActiveUsersTagIndex] = useState<
        number | null
    >(null);

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
            // invalidate resource queries
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

    const [selectedResourceType, setSelectedResourceType] =
        useState<ResourcePolicyType["id"]>("inline");

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
                            defaultValue="inline"
                            onChange={(value) => {
                                // baseForm.setValue(
                                //     "http",
                                //     value === "http"
                                // );
                                // // Update method default when switching resource type
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
                {/* <ResourcePolicyContext value={policies?.defaultPolicy}>

                </ResourcePolicyContext> */}
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
