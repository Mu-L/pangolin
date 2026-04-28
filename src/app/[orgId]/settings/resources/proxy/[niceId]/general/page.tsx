"use client";

import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useResourceContext } from "@app/hooks/useResourceContext";
import DomainPicker from "@app/components/DomainPicker";
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
import { SwitchInput } from "@app/components/SwitchInput";
import { Label } from "@app/components/ui/label";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { toast } from "@app/hooks/useToast";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { finalizeSubdomainSanitize } from "@app/lib/subdomain-utils";
import { UpdateResourceResponse } from "@server/routers/resource";
import { AxiosResponse } from "axios";
import { AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { toASCII, toUnicode } from "punycode";
import { useActionState, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import z from "zod";
import { Alert, AlertDescription } from "@app/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@app/components/ui/radio-group";
import {
    Tooltip,
    TooltipProvider,
    TooltipTrigger
} from "@app/components/ui/tooltip";
import { PaidFeaturesAlert } from "@app/components/PaidFeaturesAlert";
import { GetResourceResponse } from "@server/routers/resource/getResource";
import type { ResourceContextType } from "@app/contexts/resourceContext";
import { usePaidStatus } from "@app/hooks/usePaidStatus";
import { tierMatrix } from "@server/lib/billing/tierMatrix";
import UptimeAlertSection from "@app/components/UptimeAlertSection";

type MaintenanceSectionFormProps = {
    resource: GetResourceResponse;
    updateResource: ResourceContextType["updateResource"];
};

function MaintenanceSectionForm({
    resource,
    updateResource
}: MaintenanceSectionFormProps) {
    const { env } = useEnvContext();
    const t = useTranslations();
    const api = createApiClient({ env });
    const { isPaidUser } = usePaidStatus();

    const MaintenanceFormSchema = z.object({
        maintenanceModeEnabled: z.boolean().optional(),
        maintenanceModeType: z.enum(["forced", "automatic"]).optional(),
        maintenanceTitle: z.string().max(255).optional(),
        maintenanceMessage: z.string().max(2000).optional(),
        maintenanceEstimatedTime: z.string().max(100).optional()
    });

    const maintenanceForm = useForm({
        resolver: zodResolver(MaintenanceFormSchema),
        defaultValues: {
            maintenanceModeEnabled: resource.maintenanceModeEnabled || false,
            maintenanceModeType: resource.maintenanceModeType || "automatic",
            maintenanceTitle:
                resource.maintenanceTitle || "We'll be back soon!",
            maintenanceMessage:
                resource.maintenanceMessage ||
                "We are currently performing scheduled maintenance. Please check back soon.",
            maintenanceEstimatedTime: resource.maintenanceEstimatedTime || ""
        },
        mode: "onChange"
    });

    const isMaintenanceEnabled = maintenanceForm.watch(
        "maintenanceModeEnabled"
    );
    const maintenanceModeType = maintenanceForm.watch("maintenanceModeType");

    const [, maintenanceFormAction, maintenanceSaveLoading] = useActionState(
        onMaintenanceSubmit,
        null
    );

    async function onMaintenanceSubmit() {
        const isValid = await maintenanceForm.trigger();
        if (!isValid) return;

        const data = maintenanceForm.getValues();

        const res = await api
            .post<AxiosResponse<UpdateResourceResponse>>(
                `resource/${resource?.resourceId}`,
                {
                    maintenanceModeEnabled: data.maintenanceModeEnabled,
                    maintenanceModeType: data.maintenanceModeType,
                    maintenanceTitle: data.maintenanceTitle || null,
                    maintenanceMessage: data.maintenanceMessage || null,
                    maintenanceEstimatedTime:
                        data.maintenanceEstimatedTime || null
                }
            )
            .catch((e) => {
                toast({
                    variant: "destructive",
                    title: t("resourceErrorUpdate"),
                    description: formatAxiosError(
                        e,
                        t("resourceErrorUpdateDescription")
                    )
                });
            });

        if (res && res.status === 200) {
            updateResource({
                maintenanceModeEnabled: data.maintenanceModeEnabled,
                maintenanceModeType: data.maintenanceModeType,
                maintenanceTitle: data.maintenanceTitle || null,
                maintenanceMessage: data.maintenanceMessage || null,
                maintenanceEstimatedTime: data.maintenanceEstimatedTime || null
            });

            toast({
                title: t("resourceUpdated"),
                description: t("resourceUpdatedDescription")
            });
        }
    }

    if (!resource.http) {
        return null;
    }

    return (
        <SettingsSection>
            <SettingsSectionHeader>
                <SettingsSectionTitle>
                    {t("maintenanceMode")}
                </SettingsSectionTitle>
                <SettingsSectionDescription>
                    {t("maintenanceModeDescription")}
                </SettingsSectionDescription>
            </SettingsSectionHeader>

            <SettingsSectionBody>
                <PaidFeaturesAlert tiers={tierMatrix.maintencePage} />
                <SettingsSectionForm>
                    <Form {...maintenanceForm}>
                        <form
                            action={maintenanceFormAction}
                            className="space-y-4"
                            id="maintenance-settings-form"
                        >
                            <FormField
                                control={maintenanceForm.control}
                                name="maintenanceModeEnabled"
                                render={({ field }) => {
                                    const isDisabled =
                                        !isPaidUser(tierMatrix.maintencePage) ||
                                        resource.http === false;

                                    return (
                                        <FormItem>
                                            <div className="flex items-center space-x-2">
                                                <FormControl>
                                                    <TooltipProvider>
                                                        <Tooltip>
                                                            <TooltipTrigger
                                                                asChild
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <SwitchInput
                                                                        id="enable-maintenance"
                                                                        checked={
                                                                            field.value
                                                                        }
                                                                        label={t(
                                                                            "enableMaintenanceMode"
                                                                        )}
                                                                        disabled={
                                                                            isDisabled
                                                                        }
                                                                        onCheckedChange={(
                                                                            val
                                                                        ) => {
                                                                            if (
                                                                                !isDisabled
                                                                            ) {
                                                                                maintenanceForm.setValue(
                                                                                    "maintenanceModeEnabled",
                                                                                    val
                                                                                );
                                                                            }
                                                                        }}
                                                                    />
                                                                </div>
                                                            </TooltipTrigger>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                </FormControl>
                                            </div>
                                            <FormMessage />
                                        </FormItem>
                                    );
                                }}
                            />

                            {isMaintenanceEnabled && (
                                <div className="space-y-4">
                                    <FormField
                                        control={maintenanceForm.control}
                                        name="maintenanceModeType"
                                        render={({ field }) => (
                                            <FormItem className="space-y-3">
                                                <FormLabel>
                                                    {t("maintenanceModeType")}
                                                </FormLabel>
                                                <FormControl>
                                                    <RadioGroup
                                                        onValueChange={
                                                            field.onChange
                                                        }
                                                        defaultValue={
                                                            field.value
                                                        }
                                                        disabled={
                                                            !isPaidUser(
                                                                tierMatrix.maintencePage
                                                            )
                                                        }
                                                        className="flex flex-col space-y-1"
                                                    >
                                                        <FormItem className="flex items-start space-x-3 space-y-0">
                                                            <FormControl>
                                                                <RadioGroupItem value="automatic" />
                                                            </FormControl>
                                                            <div className="space-y-1 leading-none">
                                                                <FormLabel className="font-normal">
                                                                    <strong>
                                                                        {t(
                                                                            "automatic"
                                                                        )}
                                                                    </strong>{" "}
                                                                    (
                                                                    {t(
                                                                        "recommended"
                                                                    )}
                                                                    )
                                                                </FormLabel>
                                                                <FormDescription>
                                                                    {t(
                                                                        "automaticModeDescription"
                                                                    )}
                                                                </FormDescription>
                                                            </div>
                                                        </FormItem>
                                                        <FormItem className="flex items-start space-x-3 space-y-0">
                                                            <FormControl>
                                                                <RadioGroupItem value="forced" />
                                                            </FormControl>
                                                            <div className="space-y-1 leading-none">
                                                                <FormLabel className="font-normal">
                                                                    <strong>
                                                                        {t(
                                                                            "forced"
                                                                        )}
                                                                    </strong>
                                                                </FormLabel>
                                                                <FormDescription>
                                                                    {t(
                                                                        "forcedModeDescription"
                                                                    )}
                                                                </FormDescription>
                                                            </div>
                                                        </FormItem>
                                                    </RadioGroup>
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    {maintenanceModeType === "forced" && (
                                        <Alert variant={"neutral"}>
                                            <AlertCircle className="h-4 w-4" />
                                            <AlertDescription>
                                                {t("forcedeModeWarning")}
                                            </AlertDescription>
                                        </Alert>
                                    )}

                                    <FormField
                                        control={maintenanceForm.control}
                                        name="maintenanceTitle"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>
                                                    {t("pageTitle")}
                                                </FormLabel>
                                                <FormControl>
                                                    <Input
                                                        {...field}
                                                        disabled={
                                                            !isPaidUser(
                                                                tierMatrix.maintencePage
                                                            )
                                                        }
                                                        placeholder="We'll be back soon!"
                                                    />
                                                </FormControl>
                                                <FormDescription>
                                                    {t("pageTitleDescription")}
                                                </FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={maintenanceForm.control}
                                        name="maintenanceMessage"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>
                                                    {t(
                                                        "maintenancePageMessage"
                                                    )}
                                                </FormLabel>
                                                <FormControl>
                                                    <Textarea
                                                        {...field}
                                                        rows={4}
                                                        disabled={
                                                            !isPaidUser(
                                                                tierMatrix.maintencePage
                                                            )
                                                        }
                                                        placeholder={t(
                                                            "maintenancePageMessagePlaceholder"
                                                        )}
                                                    />
                                                </FormControl>
                                                <FormDescription>
                                                    {t(
                                                        "maintenancePageMessageDescription"
                                                    )}
                                                </FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={maintenanceForm.control}
                                        name="maintenanceEstimatedTime"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>
                                                    {t(
                                                        "maintenancePageTimeTitle"
                                                    )}
                                                </FormLabel>
                                                <FormControl>
                                                    <Input
                                                        {...field}
                                                        disabled={
                                                            !isPaidUser(
                                                                tierMatrix.maintencePage
                                                            )
                                                        }
                                                        placeholder={t(
                                                            "maintenanceTime"
                                                        )}
                                                    />
                                                </FormControl>
                                                <FormDescription>
                                                    {t(
                                                        "maintenanceEstimatedTimeDescription"
                                                    )}
                                                </FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            )}
                        </form>
                    </Form>
                </SettingsSectionForm>
            </SettingsSectionBody>

            <SettingsSectionFooter>
                <Button
                    type="submit"
                    loading={maintenanceSaveLoading}
                    disabled={
                        maintenanceSaveLoading ||
                        !isPaidUser(tierMatrix.maintencePage)
                    }
                    form="maintenance-settings-form"
                >
                    {t("saveSettings")}
                </Button>
            </SettingsSectionFooter>
        </SettingsSection>
    );
}

export default function GeneralForm() {
    const params = useParams();
    const { resource, updateResource } = useResourceContext();
    const router = useRouter();
    const t = useTranslations();

    const { env } = useEnvContext();

    const orgId = params.orgId;

    const api = createApiClient({ env });

    const [resourceFullDomain, setResourceFullDomain] = useState(
        `${resource.ssl ? "https" : "http"}://${toUnicode(resource.fullDomain || "")}`
    );

    const resourceFullDomainName = useMemo(() => {
        try {
            const url = new URL(resourceFullDomain);
            return url.hostname;
        } catch {
            return "";
        }
    }, [resourceFullDomain]);

    const GeneralFormSchema = z
        .object({
            enabled: z.boolean(),
            subdomain: z.string().optional(),
            name: z.string().min(1).max(255),
            niceId: z.string().min(1).max(255).optional(),
            domainId: z.string().optional(),
            proxyPort: z.number().int().min(1).max(65535).optional()
        })
        .refine(
            (data) => {
                // For non-HTTP resources, proxyPort should be defined
                if (!resource.http) {
                    return data.proxyPort !== undefined;
                }
                // For HTTP resources, proxyPort should be undefined
                return data.proxyPort === undefined;
            },
            {
                message: !resource.http
                    ? "Port number is required for non-HTTP resources"
                    : "Port number should not be set for HTTP resources",
                path: ["proxyPort"]
            }
        );

    type GeneralFormValues = z.infer<typeof GeneralFormSchema>;

    const form = useForm({
        resolver: zodResolver(GeneralFormSchema),
        defaultValues: {
            enabled: resource.enabled,
            name: resource.name,
            niceId: resource.niceId,
            subdomain: resource.subdomain ? resource.subdomain : undefined,
            domainId: resource.domainId || undefined,
            proxyPort: resource.proxyPort || undefined
        },
        mode: "onChange"
    });

    const [, formAction, saveLoading] = useActionState(onSubmit, null);

    async function onSubmit() {
        const isValid = await form.trigger();
        if (!isValid) return;

        const data = form.getValues();

        const res = await api
            .post<AxiosResponse<UpdateResourceResponse>>(
                `resource/${resource?.resourceId}`,
                {
                    enabled: data.enabled,
                    name: data.name,
                    niceId: data.niceId,
                    subdomain: data.subdomain
                        ? toASCII(finalizeSubdomainSanitize(data.subdomain, true))
                        : undefined,
                    domainId: data.domainId,
                    proxyPort: data.proxyPort
                }
            )
            .catch((e) => {
                toast({
                    variant: "destructive",
                    title: t("resourceErrorUpdate"),
                    description: formatAxiosError(
                        e,
                        t("resourceErrorUpdateDescription")
                    )
                });
            });

        if (res && res.status === 200) {
            const updated = res.data.data;

            updateResource({
                enabled: data.enabled,
                name: data.name,
                niceId: data.niceId,
                subdomain: data.subdomain,
                fullDomain: updated.fullDomain,
                proxyPort: data.proxyPort,
                domainId: data.domainId
            });

            toast({
                title: t("resourceUpdated"),
                description: t("resourceUpdatedDescription")
            });

            if (data.niceId && data.niceId !== resource?.niceId) {
                router.replace(
                    `/${updated.orgId}/settings/resources/proxy/${data.niceId}/general`
                );
            }

            router.refresh();
        }
    }

    return (
        <>
            <SettingsContainer>
                {resource?.resourceId && resource?.orgId && (
                    <UptimeAlertSection
                        orgId={resource.orgId}
                        resourceId={resource.resourceId}
                        startingName={resource.name}
                    />
                )}
                <SettingsSection>
                    <SettingsSectionHeader>
                        <SettingsSectionTitle>
                            {t("resourceGeneral")}
                        </SettingsSectionTitle>
                        <SettingsSectionDescription>
                            {t("resourceGeneralDescription")}
                        </SettingsSectionDescription>
                    </SettingsSectionHeader>

                    <SettingsSectionBody>
                        <SettingsSectionForm>
                            <Form {...form}>
                                <form
                                    action={formAction}
                                    className="space-y-4"
                                    id="general-settings-form"
                                >
                                    <FormField
                                        control={form.control}
                                        name="name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>
                                                    {t("name")}
                                                </FormLabel>
                                                <FormControl>
                                                    <Input {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="niceId"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>
                                                    {t("identifier")}
                                                </FormLabel>
                                                <FormControl>
                                                    <Input
                                                        {...field}
                                                        placeholder={t(
                                                            "enterIdentifier"
                                                        )}
                                                        className="flex-1"
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    {!resource.http && (
                                        <>
                                            <FormField
                                                control={form.control}
                                                name="proxyPort"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            {t(
                                                                "resourcePortNumber"
                                                            )}
                                                        </FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                type="number"
                                                                value={
                                                                    field.value !==
                                                                    undefined
                                                                        ? String(
                                                                              field.value
                                                                          )
                                                                        : ""
                                                                }
                                                                onChange={(e) =>
                                                                    field.onChange(
                                                                        e.target
                                                                            .value
                                                                            ? parseInt(
                                                                                  e
                                                                                      .target
                                                                                      .value
                                                                              )
                                                                            : undefined
                                                                    )
                                                                }
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                        <FormDescription>
                                                            {t(
                                                                "resourcePortNumberDescription"
                                                            )}
                                                        </FormDescription>
                                                    </FormItem>
                                                )}
                                            />
                                        </>
                                    )}

                                    {resource.http && (
                                        <div className="space-y-4">
                                            <div id="resource-domain-picker">
                                                <DomainPicker
                                                    allowWildcard={true}
                                                    key={resource.resourceId}
                                                    orgId={orgId as string}
                                                    cols={2}
                                                    defaultSubdomain={
                                                        form.watch(
                                                            "subdomain"
                                                        ) ?? undefined
                                                    }
                                                    defaultDomainId={
                                                        form.watch(
                                                            "domainId"
                                                        ) ?? undefined
                                                    }
                                                    defaultFullDomain={
                                                        resourceFullDomainName ||
                                                        undefined
                                                    }
                                                    onDomainChange={(res) => {
                                                        if (res === null) {
                                                            form.setValue(
                                                                "domainId",
                                                                undefined
                                                            );
                                                            form.setValue(
                                                                "subdomain",
                                                                undefined
                                                            );
                                                            setResourceFullDomain(
                                                                `${resource.ssl ? "https" : "http"}://`
                                                            );
                                                            return;
                                                        }
                                                        form.setValue(
                                                            "domainId",
                                                            res.domainId
                                                        );
                                                        form.setValue(
                                                            "subdomain",
                                                            res.subdomain ??
                                                                undefined
                                                        );
                                                        setResourceFullDomain(
                                                            `${resource.ssl ? "https" : "http"}://${toUnicode(res.fullDomain)}`
                                                        );
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <FormField
                                        control={form.control}
                                        name="enabled"
                                        render={() => (
                                            <FormItem className="col-span-2">
                                                <div className="flex items-center space-x-2">
                                                    <FormControl>
                                                        <SwitchInput
                                                            id="enable-resource"
                                                            defaultChecked={
                                                                resource.enabled
                                                            }
                                                            label={t(
                                                                "resourceEnable"
                                                            )}
                                                            onCheckedChange={(
                                                                val
                                                            ) =>
                                                                form.setValue(
                                                                    "enabled",
                                                                    val
                                                                )
                                                            }
                                                        />
                                                    </FormControl>
                                                </div>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </form>
                            </Form>
                        </SettingsSectionForm>
                    </SettingsSectionBody>

                    <SettingsSectionFooter>
                        <Button
                            type="submit"
                            loading={saveLoading}
                            disabled={saveLoading}
                            form="general-settings-form"
                        >
                            {t("saveSettings")}
                        </Button>
                    </SettingsSectionFooter>
                </SettingsSection>

                {!env.flags.disableEnterpriseFeatures && (
                    <MaintenanceSectionForm
                        resource={resource}
                        updateResource={updateResource}
                    />
                )}
            </SettingsContainer>
        </>
    );
}
