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
import { useEnvContext } from "@app/hooks/useEnvContext";
import { toast } from "@app/hooks/useToast";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { UpdateResourceResponse } from "@server/routers/resource";
import { AxiosResponse } from "axios";
import { AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
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
import { usePaidStatus } from "@app/hooks/usePaidStatus";
import { tierMatrix } from "@server/lib/billing/tierMatrix";

const maintenanceSupportedModes = ["http", "ssh", "rdp", "vnc"];

export default function ResourceMaintenancePage() {
    const params = useParams();
    const router = useRouter();
    const { env } = useEnvContext();
    const { resource, updateResource } = useResourceContext();
    const t = useTranslations();
    const api = createApiClient({ env });
    const { isPaidUser } = usePaidStatus();

    const supportsMaintenance = maintenanceSupportedModes.includes(
        resource.mode
    );

    useEffect(() => {
        if (env.flags.disableEnterpriseFeatures || !supportsMaintenance) {
            router.replace(
                `/${params.orgId}/settings/resources/public/${resource.niceId}/general`
            );
        }
    }, [
        env.flags.disableEnterpriseFeatures,
        params.orgId,
        resource.niceId,
        router,
        supportsMaintenance
    ]);

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

    if (env.flags.disableEnterpriseFeatures || !supportsMaintenance) {
        return null;
    }

    return (
        <SettingsContainer>
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
                                        const isDisabled = !isPaidUser(
                                            tierMatrix.maintencePage
                                        );

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
                                                <FormDescription>
                                                    {t(
                                                        "enableMaintenanceModeDescription"
                                                    )}
                                                </FormDescription>
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
                                                        {t(
                                                            "maintenanceModeType"
                                                        )}
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
                                                        {t(
                                                            "pageTitleDescription"
                                                        )}
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
        </SettingsContainer>
    );
}
