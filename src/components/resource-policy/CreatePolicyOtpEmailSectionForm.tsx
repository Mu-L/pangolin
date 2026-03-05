"use client";

import {
    SettingsSection,
    SettingsSectionBody,
    SettingsSectionDescription,
    SettingsSectionForm,
    SettingsSectionHeader,
    SettingsSectionTitle
} from "@app/components/Settings";

import { useTranslations } from "next-intl";

import z from "zod";

import { type PolicyFormValues } from ".";

import { SwitchInput } from "@app/components/SwitchInput";
import { Tag, TagInput } from "@app/components/tags/tag-input";
import { Alert, AlertDescription, AlertTitle } from "@app/components/ui/alert";
import { Button } from "@app/components/ui/button";
import {
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@app/components/ui/form";
import { InfoPopup } from "@app/components/ui/info-popup";

import { InfoIcon, Plus } from "lucide-react";

import { useState } from "react";
import { type UseFormReturn } from "react-hook-form";

// ─── CreatePolicyOtpEmailSectionForm ──────────────────────────────────────────

export type CreatePolicyOtpEmailSectionFormProps = {
    form: UseFormReturn<PolicyFormValues, any, any>;
    emailEnabled: boolean;
};

export function CreatePolicyOtpEmailSectionForm({
    form,
    emailEnabled
}: CreatePolicyOtpEmailSectionFormProps) {
    const t = useTranslations();
    const [isExpanded, setIsExpanded] = useState(false);
    const [whitelistEnabled, setWhitelistEnabled] = useState(false);
    const [activeEmailTagIndex, setActiveEmailTagIndex] = useState<
        number | null
    >(null);

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
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsExpanded(true)}
                    >
                        <Plus className="mr-2 h-4 w-4" />
                        {t("resourcePolicyOtpEmailAdd")}
                    </Button>
                </SettingsSectionBody>
            </SettingsSection>
        );
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
                        defaultChecked={false}
                        onCheckedChange={(val) => {
                            setWhitelistEnabled(val);
                            form.setValue("emailWhitelistEnabled", val);
                        }}
                        disabled={!emailEnabled}
                    />

                    {whitelistEnabled && emailEnabled && (
                        <FormField
                            control={form.control}
                            name="emails"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>
                                        <InfoPopup
                                            text={t("otpEmailWhitelistList")}
                                            info={t(
                                                "otpEmailWhitelistListDescription"
                                            )}
                                        />
                                    </FormLabel>
                                    <FormControl>
                                        {/* @ts-ignore */}
                                        <TagInput
                                            {...field}
                                            activeTagIndex={activeEmailTagIndex}
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
                                                                    message: t(
                                                                        "otpEmailErrorInvalid"
                                                                    )
                                                                }
                                                            )
                                                    )
                                                    .safeParse(tag).success;
                                            }}
                                            setActiveTagIndex={
                                                setActiveEmailTagIndex
                                            }
                                            placeholder={t("otpEmailEnter")}
                                            tags={form.getValues().emails}
                                            setTags={(newEmails) => {
                                                form.setValue(
                                                    "emails",
                                                    newEmails as [Tag, ...Tag[]]
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
            </SettingsSectionBody>
        </SettingsSection>
    );
}
