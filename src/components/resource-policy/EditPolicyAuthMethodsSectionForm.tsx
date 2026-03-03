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

import { createApiClient } from "@app/lib/api";
import { useRouter } from "next/navigation";
import { createPolicySchema } from ".";

import {
    Credenza,
    CredenzaBody,
    CredenzaClose,
    CredenzaContent,
    CredenzaDescription,
    CredenzaFooter,
    CredenzaHeader,
    CredenzaTitle
} from "@app/components/Credenza";
import { SwitchInput } from "@app/components/SwitchInput";
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
import {
    InputOTP,
    InputOTPGroup,
    InputOTPSlot
} from "@app/components/ui/input-otp";

import { Binary, Bot, Key, Plus } from "lucide-react";

import { cn } from "@app/lib/cn";
import { useResourcePolicyContext } from "@app/providers/ResourcePolicyProvider";
import { useActionState, useState } from "react";
import { useForm } from "react-hook-form";

// ─── PolicyAuthMethodsSection ─────────────────────────────────────────────────

const setPasswordSchema = z.object({
    password: z.string().min(4).max(100)
});

const setPincodeSchema = z.object({
    pincode: z.string().length(6)
});

const setHeaderAuthSchema = z.object({
    user: z.string().min(4).max(100),
    password: z.string().min(4).max(100),
    extendedCompatibility: z.boolean()
});

export function EditPolicyAuthMethodsSectionForm() {
    const { policy } = useResourcePolicyContext();
    const router = useRouter();

    const api = createApiClient(useEnvContext());

    const form = useForm({
        resolver: zodResolver(
            createPolicySchema.pick({
                password: true,
                pincode: true,
                headerAuth: true
            })
        )
    });

    const t = useTranslations();
    const [isExpanded, setIsExpanded] = useState(false);
    const [isSetPasswordOpen, setIsSetPasswordOpen] = useState(false);
    const [isSetPincodeOpen, setIsSetPincodeOpen] = useState(false);
    const [isSetHeaderAuthOpen, setIsSetHeaderAuthOpen] = useState(false);

    const hasPassword = Boolean(form.watch("password") ?? policy.passwordId);
    const hasPincode = Boolean(form.watch("pincode") ?? policy.pincodeId);
    const hasHeaderAuth = Boolean(
        form.watch("headerAuth") ?? policy.headerAuth
    );

    const passwordForm = useForm({
        resolver: zodResolver(setPasswordSchema),
        defaultValues: { password: "" }
    });

    const pincodeForm = useForm({
        resolver: zodResolver(setPincodeSchema),
        defaultValues: { pincode: "" }
    });

    const headerAuthForm = useForm({
        resolver: zodResolver(setHeaderAuthSchema),
        defaultValues: { user: "", password: "", extendedCompatibility: true }
    });

    const [, formAction, isSubmitting] = useActionState(onSubmit, null);

    async function onSubmit() {
        const isValid = await form.trigger();

        if (!isValid) return;

        const payload = form.getValues();
        console.log({ payload });
    }

    if (!isExpanded) {
        return (
            <SettingsSection>
                <SettingsSectionHeader>
                    <SettingsSectionTitle>
                        {t("resourceAuthMethods")}
                    </SettingsSectionTitle>
                    <SettingsSectionDescription>
                        {t("resourcePolicyAuthMethodsDescription")}
                    </SettingsSectionDescription>
                </SettingsSectionHeader>
                <SettingsSectionBody>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsExpanded(true)}
                    >
                        <Plus className="mr-2 h-4 w-4" />
                        {t("resourcePolicyAuthMethodAdd")}
                    </Button>
                </SettingsSectionBody>
            </SettingsSection>
        );
    }

    return (
        <>
            {/* Password Credenza */}
            <Credenza
                open={isSetPasswordOpen}
                onOpenChange={(val) => {
                    setIsSetPasswordOpen(val);
                    if (!val) passwordForm.reset();
                }}
            >
                <CredenzaContent>
                    <CredenzaHeader>
                        <CredenzaTitle>
                            {t("resourcePasswordSetupTitle")}
                        </CredenzaTitle>
                        <CredenzaDescription>
                            {t("resourcePasswordSetupTitleDescription")}
                        </CredenzaDescription>
                    </CredenzaHeader>
                    <CredenzaBody>
                        <Form {...passwordForm}>
                            <form
                                onSubmit={passwordForm.handleSubmit((data) => {
                                    form.setValue("password", data);
                                    setIsSetPasswordOpen(false);
                                    passwordForm.reset();
                                })}
                                className="space-y-4"
                                id="set-password-form"
                            >
                                <FormField
                                    control={passwordForm.control}
                                    name="password"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                {t("password")}
                                            </FormLabel>
                                            <FormControl>
                                                <Input
                                                    autoComplete="off"
                                                    type="password"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </form>
                        </Form>
                    </CredenzaBody>
                    <CredenzaFooter>
                        <CredenzaClose asChild>
                            <Button variant="outline">{t("close")}</Button>
                        </CredenzaClose>
                        <Button type="submit" form="set-password-form">
                            {t("resourcePasswordSubmit")}
                        </Button>
                    </CredenzaFooter>
                </CredenzaContent>
            </Credenza>

            {/* Pincode Credenza */}
            <Credenza
                open={isSetPincodeOpen}
                onOpenChange={(val) => {
                    setIsSetPincodeOpen(val);
                    if (!val) pincodeForm.reset();
                }}
            >
                <CredenzaContent>
                    <CredenzaHeader>
                        <CredenzaTitle>
                            {t("resourcePincodeSetupTitle")}
                        </CredenzaTitle>
                        <CredenzaDescription>
                            {t("resourcePincodeSetupTitleDescription")}
                        </CredenzaDescription>
                    </CredenzaHeader>
                    <CredenzaBody>
                        <Form {...pincodeForm}>
                            <form
                                onSubmit={pincodeForm.handleSubmit((data) => {
                                    form.setValue("pincode", data);
                                    setIsSetPincodeOpen(false);
                                    pincodeForm.reset();
                                })}
                                className="space-y-4"
                                id="set-pincode-form"
                            >
                                <FormField
                                    control={pincodeForm.control}
                                    name="pincode"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                {t("resourcePincode")}
                                            </FormLabel>
                                            <FormControl>
                                                <div className="flex justify-center">
                                                    <InputOTP
                                                        autoComplete="false"
                                                        maxLength={6}
                                                        {...field}
                                                    >
                                                        <InputOTPGroup className="flex">
                                                            <InputOTPSlot
                                                                index={0}
                                                                obscured
                                                            />
                                                            <InputOTPSlot
                                                                index={1}
                                                                obscured
                                                            />
                                                            <InputOTPSlot
                                                                index={2}
                                                                obscured
                                                            />
                                                            <InputOTPSlot
                                                                index={3}
                                                                obscured
                                                            />
                                                            <InputOTPSlot
                                                                index={4}
                                                                obscured
                                                            />
                                                            <InputOTPSlot
                                                                index={5}
                                                                obscured
                                                            />
                                                        </InputOTPGroup>
                                                    </InputOTP>
                                                </div>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </form>
                        </Form>
                    </CredenzaBody>
                    <CredenzaFooter>
                        <CredenzaClose asChild>
                            <Button variant="outline">{t("close")}</Button>
                        </CredenzaClose>
                        <Button type="submit" form="set-pincode-form">
                            {t("resourcePincodeSubmit")}
                        </Button>
                    </CredenzaFooter>
                </CredenzaContent>
            </Credenza>

            {/* Header Auth Credenza */}
            <Credenza
                open={isSetHeaderAuthOpen}
                onOpenChange={(val) => {
                    setIsSetHeaderAuthOpen(val);
                    if (!val) headerAuthForm.reset();
                }}
            >
                <CredenzaContent>
                    <CredenzaHeader>
                        <CredenzaTitle>
                            {t("resourceHeaderAuthSetupTitle")}
                        </CredenzaTitle>
                        <CredenzaDescription>
                            {t("resourceHeaderAuthSetupTitleDescription")}
                        </CredenzaDescription>
                    </CredenzaHeader>
                    <CredenzaBody>
                        <Form {...headerAuthForm}>
                            <form
                                onSubmit={headerAuthForm.handleSubmit(
                                    (data) => {
                                        form.setValue("headerAuth", data);
                                        setIsSetHeaderAuthOpen(false);
                                        headerAuthForm.reset();
                                    }
                                )}
                                className="space-y-4"
                                id="set-header-auth-form"
                            >
                                <FormField
                                    control={headerAuthForm.control}
                                    name="user"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t("user")}</FormLabel>
                                            <FormControl>
                                                <Input
                                                    autoComplete="off"
                                                    type="text"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={headerAuthForm.control}
                                    name="password"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                {t("password")}
                                            </FormLabel>
                                            <FormControl>
                                                <Input
                                                    autoComplete="off"
                                                    type="password"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={headerAuthForm.control}
                                    name="extendedCompatibility"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormControl>
                                                <SwitchInput
                                                    id="header-auth-compatibility-toggle"
                                                    label={t(
                                                        "headerAuthCompatibility"
                                                    )}
                                                    info={t(
                                                        "headerAuthCompatibilityInfo"
                                                    )}
                                                    checked={field.value}
                                                    onCheckedChange={
                                                        field.onChange
                                                    }
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </form>
                        </Form>
                    </CredenzaBody>
                    <CredenzaFooter>
                        <CredenzaClose asChild>
                            <Button variant="outline">{t("close")}</Button>
                        </CredenzaClose>
                        <Button type="submit" form="set-header-auth-form">
                            {t("resourceHeaderAuthSubmit")}
                        </Button>
                    </CredenzaFooter>
                </CredenzaContent>
            </Credenza>

            <Form {...form}>
                <form action={() => {}}>
                    <SettingsSection>
                        <SettingsSectionHeader>
                            <SettingsSectionTitle>
                                {t("resourceAuthMethods")}
                            </SettingsSectionTitle>
                            <SettingsSectionDescription>
                                {t("resourcePolicyAuthMethodsDescription")}
                            </SettingsSectionDescription>
                        </SettingsSectionHeader>
                        <SettingsSectionBody>
                            <SettingsSectionForm>
                                {/* Password row */}
                                <div className="flex items-center justify-between border rounded-md p-2 mb-4">
                                    <div
                                        className={cn(
                                            "flex items-center text-sm gap-x-2",
                                            hasPassword && "text-green-500"
                                        )}
                                    >
                                        <Key size="14" />
                                        <span>
                                            {t("resourcePasswordProtection", {
                                                status: hasPassword
                                                    ? t("enabled")
                                                    : t("disabled")
                                            })}
                                        </span>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        onClick={
                                            hasPassword
                                                ? () =>
                                                      form.setValue(
                                                          "password",
                                                          null
                                                      )
                                                : () =>
                                                      setIsSetPasswordOpen(true)
                                        }
                                    >
                                        {hasPassword
                                            ? t("passwordRemove")
                                            : t("passwordAdd")}
                                    </Button>
                                </div>

                                {/* Pincode row */}
                                <div className="flex items-center justify-between border rounded-md p-2">
                                    <div
                                        className={cn(
                                            "flex items-center gap-x-2 text-sm",
                                            hasPincode && "text-green-500"
                                        )}
                                    >
                                        <Binary size="14" />
                                        <span>
                                            {t("resourcePincodeProtection", {
                                                status: hasPincode
                                                    ? t("enabled")
                                                    : t("disabled")
                                            })}
                                        </span>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        onClick={
                                            hasPincode
                                                ? () =>
                                                      form.setValue(
                                                          "pincode",
                                                          null
                                                      )
                                                : () =>
                                                      setIsSetPincodeOpen(true)
                                        }
                                    >
                                        {hasPincode
                                            ? t("pincodeRemove")
                                            : t("pincodeAdd")}
                                    </Button>
                                </div>

                                {/* Header auth row */}
                                <div className="flex items-center justify-between border rounded-md p-2">
                                    <div
                                        className={cn(
                                            "flex items-center gap-x-2 text-sm",
                                            hasHeaderAuth && "text-green-500"
                                        )}
                                    >
                                        <Bot size="14" />
                                        <span>
                                            {hasHeaderAuth
                                                ? t(
                                                      "resourceHeaderAuthProtectionEnabled"
                                                  )
                                                : t(
                                                      "resourceHeaderAuthProtectionDisabled"
                                                  )}
                                        </span>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        onClick={
                                            hasHeaderAuth
                                                ? () =>
                                                      form.setValue(
                                                          "headerAuth",
                                                          null
                                                      )
                                                : () =>
                                                      setIsSetHeaderAuthOpen(
                                                          true
                                                      )
                                        }
                                    >
                                        {hasHeaderAuth
                                            ? t("headerAuthRemove")
                                            : t("headerAuthAdd")}
                                    </Button>
                                </div>
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
        </>
    );
}
