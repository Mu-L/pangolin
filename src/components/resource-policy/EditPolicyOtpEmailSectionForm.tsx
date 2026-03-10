"use client";

import {
    SettingsSection,
    SettingsSectionBody,
    SettingsSectionDescription,
    SettingsSectionFooter,
    SettingsSectionForm,
    SettingsSectionHeader,
    SettingsSectionTitle
} from "@app/components/Settings";

import { useTranslations } from "next-intl";

import z from "zod";

import { createPolicySchema, type PolicyFormValues } from ".";

import { toast } from "@app/hooks/useToast";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import type { AxiosResponse } from "axios";
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
    FormLabel
} from "@app/components/ui/form";
import { InfoPopup } from "@app/components/ui/info-popup";

import { InfoIcon, Plus } from "lucide-react";

import { useActionState, useState } from "react";
import { useForm, UseFormReturn, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useResourcePolicyContext } from "@app/providers/ResourcePolicyProvider";

// ─── PolicyOtpEmailSection ────────────────────────────────────────────────────

type PolicyOtpEmailSectionProps = {
    emailEnabled: boolean;
    readonly?: boolean;
};

export function EditPolicyOtpEmailSectionForm({
    emailEnabled,
    readonly
}: PolicyOtpEmailSectionProps) {
    const t = useTranslations();

    const { policy } = useResourcePolicyContext();
    const router = useRouter();

    const api = createApiClient(useEnvContext());

    const form = useForm({
        resolver: zodResolver(
            createPolicySchema.pick({
                emailWhitelistEnabled: true,
                emails: true
            })
        ),
        defaultValues: {
            emailWhitelistEnabled: policy.emailWhitelistEnabled,
            emails: policy.emailWhiteList.map((email) => ({
                id: email.whiteListId.toString(),
                text: email.email
            }))
        }
    });

    const whitelistEnabled = useWatch({
        control: form.control,
        name: "emailWhitelistEnabled"
    });

    const [isExpanded, setIsExpanded] = useState(whitelistEnabled);
    const [activeEmailTagIndex, setActiveEmailTagIndex] = useState<
        number | null
    >(null);

    const [, formAction, isSubmitting] = useActionState(onSubmit, null);

    async function onSubmit() {
        if (readonly) return;
        const isValid = await form.trigger();

        if (!isValid) return;

        const payload = form.getValues();

        try {
            const res = await api
                .put<AxiosResponse<{}>>(
                    `/resource-policy/${policy.resourcePolicyId}/whitelist`,
                    {
                        emailWhitelistEnabled: payload.emailWhitelistEnabled,
                        emails: payload.emails?.map((e) => e.text) ?? []
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

    if (!isExpanded) {
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
                    {!readonly && (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsExpanded(true)}
                        >
                            <Plus className="mr-2 h-4 w-4" />
                            {t("resourcePolicyOtpEmailAdd")}
                        </Button>
                    )}
                </SettingsSectionBody>
            </SettingsSection>
        );
    }

    return (
        <Form {...form}>
            <form action={formAction}>
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
                            {!emailEnabled && (
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
                                defaultChecked={whitelistEnabled}
                                onCheckedChange={(val) => {
                                    form.setValue("emailWhitelistEnabled", val);
                                }}
                                disabled={readonly || !emailEnabled}
                            />

                            {whitelistEnabled && emailEnabled && (
                                <FormField
                                    control={form.control}
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
                                                    size="sm"
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
                                                        form.getValues()
                                                            .emails ?? []
                                                    }
                                                    setTags={(newEmails) => {
                                                        form.setValue(
                                                            "emails",
                                                            newEmails as [
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
                            )}
                        </SettingsSectionForm>

                        <SettingsSectionFooter>
                            <Button
                                type="submit"
                                loading={isSubmitting}
                                disabled={
                                    readonly || isSubmitting || !emailEnabled
                                }
                            >
                                {t("otpEmailWhitelistSave")}
                            </Button>
                        </SettingsSectionFooter>
                    </SettingsSectionBody>
                </SettingsSection>
            </form>
        </Form>
    );
}
