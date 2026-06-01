"use client";

import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import {
    SettingsContainer,
    SettingsSection,
    SettingsSectionBody,
    SettingsSectionDescription,
    SettingsSectionForm,
    SettingsSectionHeader,
    SettingsSectionTitle
} from "@app/components/Settings";
import { SwitchInput } from "@app/components/SwitchInput";
import { Alert, AlertDescription } from "@app/components/ui/alert";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@app/components/ui/form";
import type { ResourceContextType } from "@app/contexts/resourceContext";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useResourceContext } from "@app/hooks/useResourceContext";
import { toast } from "@app/hooks/useToast";
import { createApiClient } from "@app/lib/api";
import { formatAxiosError } from "@app/lib/api/formatAxiosError";
import { resourceQueries } from "@app/lib/queries";
import { zodResolver } from "@hookform/resolvers/zod";
import { tlsNameSchema } from "@server/lib/schemas";
import { useQuery } from "@tanstack/react-query";
import {
    ProxyResourceTargetsForm
} from "@app/app/[orgId]/settings/resources/public/ProxyResourceTargetsForm";
import {
    AlertTriangle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
    use,
    useActionState,
} from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

export default function ReverseProxyTargetsPage(props: {
    params: Promise<{ resourceId: number; orgId: string }>;
}) {
    const params = use(props.params);
    const { resource, updateResource } = useResourceContext();

    const { data: remoteTargets = [], isLoading: isLoadingTargets } = useQuery(
        resourceQueries.resourceTargets({
            resourceId: resource.resourceId
        })
    );

    if (isLoadingTargets) {
        return null;
    }

    return (
        <SettingsContainer>
            <ProxyResourceTargetsForm
                orgId={params.orgId}
                isHttp={["http", "ssh", "rdp", "vnc"].includes(resource.mode)}
                initialTargets={remoteTargets}
                resource={resource}
                updateResource={updateResource}
            />

            {resource.mode == "tcp" && (
                <ProxyResourceProtocolForm
                    resource={resource}
                    updateResource={updateResource}
                />
            )}
        </SettingsContainer>
    );
}

function ProxyResourceProtocolForm({
    resource,
    updateResource
}: Pick<ResourceContextType, "resource" | "updateResource">) {
    const t = useTranslations();

    const api = createApiClient(useEnvContext());

    const proxySettingsSchema = z.object({
        setHostHeader: z
            .string()
            .optional()
            .refine(
                (data) => {
                    if (data) {
                        return tlsNameSchema.safeParse(data).success;
                    }
                    return true;
                },
                {
                    message: t("proxyErrorInvalidHeader")
                }
            ),
        headers: z
            .array(z.object({ name: z.string(), value: z.string() }))
            .nullable(),
        proxyProtocol: z.boolean().optional(),
        proxyProtocolVersion: z.int().min(1).max(2).optional()
    });

    const proxySettingsForm = useForm({
        resolver: zodResolver(proxySettingsSchema),
        defaultValues: {
            setHostHeader: resource.setHostHeader || "",
            headers: resource.headers,
            proxyProtocol: resource.proxyProtocol || false,
            proxyProtocolVersion: resource.proxyProtocolVersion || 1
        }
    });

    const router = useRouter();

    const [, formAction, isSubmitting] = useActionState(
        saveProtocolSettings,
        null
    );

    async function saveProtocolSettings() {
        const isValid = proxySettingsForm.trigger();
        if (!isValid) return;

        try {
            // For TCP/UDP resources, save proxy protocol settings
            const proxyData = proxySettingsForm.getValues();

            const payload = {
                proxyProtocol: proxyData.proxyProtocol || false,
                proxyProtocolVersion: proxyData.proxyProtocolVersion || 1
            };

            await api.post(`/resource/${resource.resourceId}`, payload);

            updateResource({
                ...resource,
                proxyProtocol: proxyData.proxyProtocol || false,
                proxyProtocolVersion: proxyData.proxyProtocolVersion || 1
            });

            toast({
                title: t("settingsUpdated"),
                description: t("settingsUpdatedDescription")
            });

            router.refresh();
        } catch (err) {
            console.error(err);
            toast({
                variant: "destructive",
                title: t("settingsErrorUpdate"),
                description: formatAxiosError(
                    err,
                    t("settingsErrorUpdateDescription")
                )
            });
        }
    }

    return (
        <SettingsSection>
            <SettingsSectionHeader>
                <SettingsSectionTitle>
                    {t("proxyProtocol")}
                </SettingsSectionTitle>
                <SettingsSectionDescription>
                    {t("proxyProtocolDescription")}
                </SettingsSectionDescription>
            </SettingsSectionHeader>
            <SettingsSectionBody>
                <SettingsSectionForm>
                    <Form {...proxySettingsForm}>
                        <form
                            action={formAction}
                            className="space-y-4"
                            id="proxy-protocol-settings-form"
                        >
                            <FormField
                                control={proxySettingsForm.control}
                                name="proxyProtocol"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormControl>
                                            <SwitchInput
                                                id="proxy-protocol-toggle"
                                                label={t("enableProxyProtocol")}
                                                description={t(
                                                    "proxyProtocolInfo"
                                                )}
                                                defaultChecked={
                                                    field.value || false
                                                }
                                                onCheckedChange={(val) => {
                                                    field.onChange(val);
                                                }}
                                            />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />

                            {proxySettingsForm.watch("proxyProtocol") && (
                                <>
                                    <FormField
                                        control={proxySettingsForm.control}
                                        name="proxyProtocolVersion"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>
                                                    {t("proxyProtocolVersion")}
                                                </FormLabel>
                                                <FormControl>
                                                    <Select
                                                        value={String(
                                                            field.value || 1
                                                        )}
                                                        onValueChange={(
                                                            value
                                                        ) =>
                                                            field.onChange(
                                                                parseInt(
                                                                    value,
                                                                    10
                                                                )
                                                            )
                                                        }
                                                    >
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select version" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="1">
                                                                {t("version1")}
                                                            </SelectItem>
                                                            <SelectItem value="2">
                                                                {t("version2")}
                                                            </SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </FormControl>
                                                <FormDescription>
                                                    {t("versionDescription")}
                                                </FormDescription>
                                            </FormItem>
                                        )}
                                    />

                                    <Alert>
                                        <AlertTriangle className="h-4 w-4" />
                                        <AlertDescription>
                                            <strong>{t("warning")}:</strong>{" "}
                                            {t("proxyProtocolWarning")}
                                        </AlertDescription>
                                    </Alert>
                                </>
                            )}
                        </form>
                    </Form>
                </SettingsSectionForm>
                <form action={formAction} className="flex justify-end">
                    <Button
                        disabled={isSubmitting}
                        loading={isSubmitting}
                        type="submit"
                    >
                        {t("saveProxyProtocol")}
                    </Button>
                </form>
            </SettingsSectionBody>
        </SettingsSection>
    );
}
