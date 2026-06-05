"use client";

import {
    SettingsSection,
    SettingsSectionBody,
    SettingsSectionDescription,
    SettingsSectionForm,
    SettingsSectionHeader,
    SettingsSectionTitle
} from "@app/components/Settings";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";

import z from "zod";

import { createPolicySchema, type PolicyFormValues } from ".";

import { SwitchInput } from "@app/components/SwitchInput";
import { Button } from "@app/components/ui/button";
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

import { cn } from "@app/lib/cn";
import { Binary, Bot, Key, Plus } from "lucide-react";

import { useEffect, useState } from "react";
import { type UseFormReturn, useForm, useWatch } from "react-hook-form";

// ─── CreatePolicyAuthMethodsSectionForm ───────────────────────────────────────

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

export type CreatePolicyAuthMethodsSectionFormProps = {
    form: UseFormReturn<PolicyFormValues, any, any>;
};

export function CreatePolicyAuthMethodsSectionForm({
    form: parentForm
}: CreatePolicyAuthMethodsSectionFormProps) {
    const t = useTranslations();
    const [isExpanded, setIsExpanded] = useState(false);
    const [isSetPasswordOpen, setIsSetPasswordOpen] = useState(false);
    const [isSetPincodeOpen, setIsSetPincodeOpen] = useState(false);
    const [isSetHeaderAuthOpen, setIsSetHeaderAuthOpen] = useState(false);

    const form = useForm({
        resolver: zodResolver(
            createPolicySchema.pick({
                password: true,
                pincode: true,
                headerAuth: true
            })
        ),
        defaultValues: {
            password: null,
            pincode: null,
            headerAuth: null
        }
    });

    useEffect(() => {
        const subscription = form.watch((values) => {
            parentForm.setValue("password", values.password as any);
            parentForm.setValue("pincode", values.pincode as any);
            parentForm.setValue("headerAuth", values.headerAuth as any);
        });
        return () => subscription.unsubscribe();
    }, [form, parentForm]);

    const password = useWatch({
        control: form.control,
        name: "password"
    });
    const pincode = useWatch({
        control: form.control,
        name: "pincode"
    });
    const headerAuth = useWatch({
        control: form.control,
        name: "headerAuth"
    });

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
                                                    description={t(
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
                                    "flex items-center text-sm space-x-2",
                                    password && "text-green-500"
                                )}
                            >
                                <Key size="14" />
                                <span>
                                    {t("resourcePasswordProtection", {
                                        status: password
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
                                    password
                                        ? () => form.setValue("password", null)
                                        : () => setIsSetPasswordOpen(true)
                                }
                            >
                                {password
                                    ? t("passwordRemove")
                                    : t("passwordAdd")}
                            </Button>
                        </div>

                        {/* Pincode row */}
                        <div className="flex items-center justify-between border rounded-md p-2">
                            <div
                                className={cn(
                                    "flex items-center space-x-2 text-sm",
                                    pincode && "text-green-500"
                                )}
                            >
                                <Binary size="14" />
                                <span>
                                    {t("resourcePincodeProtection", {
                                        status: pincode
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
                                    pincode
                                        ? () => form.setValue("pincode", null)
                                        : () => setIsSetPincodeOpen(true)
                                }
                            >
                                {pincode ? t("pincodeRemove") : t("pincodeAdd")}
                            </Button>
                        </div>

                        {/* Header auth row */}
                        <div className="flex items-center justify-between border rounded-md p-2">
                            <div
                                className={cn(
                                    "flex items-center space-x-2 text-sm",
                                    headerAuth && "text-green-500"
                                )}
                            >
                                <Bot size="14" />
                                <span>
                                    {headerAuth
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
                                    headerAuth
                                        ? () =>
                                              form.setValue("headerAuth", null)
                                        : () => setIsSetHeaderAuthOpen(true)
                                }
                            >
                                {headerAuth
                                    ? t("headerAuthRemove")
                                    : t("headerAuthAdd")}
                            </Button>
                        </div>
                    </SettingsSectionForm>
                </SettingsSectionBody>
            </SettingsSection>
        </>
    );
}
