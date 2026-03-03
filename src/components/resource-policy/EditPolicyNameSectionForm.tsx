"use client";

import {
    SettingsSection,
    SettingsSectionBody,
    SettingsSectionDescription,
    SettingsSectionForm,
    SettingsSectionHeader,
    SettingsSectionTitle
} from "@app/components/Settings";

import { useEnvContext } from "@app/hooks/useEnvContext";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";

import z from "zod";

import { toast } from "@app/hooks/useToast";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { type ResourcePolicy } from "@server/db";
import type { AxiosResponse } from "axios";
import { useRouter } from "next/navigation";

import { Button } from "@app/components/ui/button";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@app/components/ui/form";
import { Input } from "@app/components/ui/input";

import { useResourcePolicyContext } from "@app/providers/ResourcePolicyProvider";
import { useActionState } from "react";
import { useForm } from "react-hook-form";

// ─── PolicyNameSection ──────────────────────────────────────────────────

export function EditPolicyNameSectionForm() {
    const t = useTranslations();
    const api = createApiClient(useEnvContext());
    const router = useRouter();

    const { policy } = useResourcePolicyContext();

    const form = useForm({
        resolver: zodResolver(
            z.object({
                name: z.string()
            })
        ),
        defaultValues: {
            name: policy.name
        }
    });

    const [, formAction, isSubmitting] = useActionState(onSubmit, null);

    async function onSubmit() {
        const isValid = await form.trigger();

        if (!isValid) return;

        const payload = form.getValues();

        try {
            const res = await api
                .put<AxiosResponse<ResourcePolicy>>(
                    `/resource-policy/${policy.resourcePolicyId}`,
                    {
                        name: payload.name
                    }
                )
                .catch((e) => {
                    toast({
                        variant: "destructive",
                        title: t("policyErrorUpdate"),
                        description: formatAxiosError(
                            e,
                            t("policyErrorUpdateDescription")
                        )
                    });
                });

            if (res && res.status === 200) {
                toast({
                    title: t("success"),
                    description: t("policyUpdatedSuccess")
                });
                router.refresh();
            }
        } catch (e) {
            toast({
                variant: "destructive",
                title: t("policyErrorUpdate"),
                description: t("policyErrorUpdateMessageDescription")
            });
        }
    }

    return (
        <Form {...form}>
            <form action={formAction}>
                <SettingsSection>
                    <SettingsSectionHeader>
                        <SettingsSectionTitle>
                            {t("resourcePolicyName")}
                        </SettingsSectionTitle>
                        <SettingsSectionDescription>
                            {t("resourcePolicyNameDescription")}
                        </SettingsSectionDescription>
                    </SettingsSectionHeader>
                    <SettingsSectionBody>
                        <SettingsSectionForm>
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t("name")}</FormLabel>
                                        <FormControl>
                                            <Input
                                                {...field}
                                                placeholder={t(
                                                    "resourcePolicyNamePlaceholder"
                                                )}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </SettingsSectionForm>
                    </SettingsSectionBody>

                    <div className="flex py-6 justify-end">
                        <Button
                            type="submit"
                            loading={isSubmitting}
                            disabled={isSubmitting}
                        >
                            {t("saveSettings")}
                        </Button>
                    </div>
                </SettingsSection>
            </form>
        </Form>
    );
}
