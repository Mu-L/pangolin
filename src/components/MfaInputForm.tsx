"use client";

import { useEffect, useRef } from "react";
import { UseFormReturn } from "react-hook-form";
import { Button } from "@app/components/ui/button";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormMessage
} from "@app/components/ui/form";
import {
    InputOTP,
    InputOTPGroup,
    InputOTPSlot
} from "./ui/input-otp";
import { Alert, AlertDescription } from "@app/components/ui/alert";
import { useTranslations } from "next-intl";
import { REGEXP_ONLY_DIGITS_AND_CHARS } from "input-otp";
import * as z from "zod";

type MfaInputFormProps = {
    form: UseFormReturn<{ code: string }>;
    onSubmit: (values: { code: string }) => void | Promise<void>;
    onBack: () => void;
    error?: string | null;
    loading?: boolean;
    formId?: string;
};

export default function MfaInputForm({
    form,
    onSubmit,
    onBack,
    error,
    loading = false,
    formId = "mfaForm"
}: MfaInputFormProps) {
    const t = useTranslations();
    const otpContainerRef = useRef<HTMLDivElement>(null);

    // Auto-focus MFA input when component mounts
    useEffect(() => {
        const focusInput = () => {
            // Try using the ref first
            if (otpContainerRef.current) {
                const hiddenInput = otpContainerRef.current.querySelector(
                    "input"
                ) as HTMLInputElement;
                if (hiddenInput) {
                    hiddenInput.focus();
                    return;
                }
            }

            // Fallback: query the DOM
            const otpContainer = document.querySelector(
                '[data-slot="input-otp"]'
            );
            if (!otpContainer) return;

            const hiddenInput = otpContainer.querySelector(
                "input"
            ) as HTMLInputElement;
            if (hiddenInput) {
                hiddenInput.focus();
                return;
            }

            // Last resort: click the first slot
            const firstSlot = otpContainer.querySelector(
                '[data-slot="input-otp-slot"]'
            ) as HTMLElement;
            if (firstSlot) {
                firstSlot.click();
            }
        };

        // Use requestAnimationFrame to wait for the next paint
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                focusInput();
            });
        });
    }, []);

    return (
        <div className="space-y-4">
            <div className="text-center">
                <h3 className="text-lg font-medium">{t("otpAuth")}</h3>
                <p className="text-sm text-muted-foreground">
                    {t("otpAuthDescription")}
                </p>
            </div>
            <Form {...form}>
                <form
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="space-y-4"
                    id={formId}
                >
                    <FormField
                        control={form.control}
                        name="code"
                        render={({ field }) => (
                            <FormItem>
                                <FormControl>
                                    <div
                                        ref={otpContainerRef}
                                        className="flex justify-center"
                                    >
                                        <InputOTP
                                            maxLength={6}
                                            {...field}
                                            autoFocus
                                            pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
                                            onChange={(value: string) => {
                                                field.onChange(value);
                                                if (value.length === 6) {
                                                    form.handleSubmit(onSubmit)();
                                                }
                                            }}
                                        >
                                            <InputOTPGroup>
                                                <InputOTPSlot index={0} />
                                                <InputOTPSlot index={1} />
                                                <InputOTPSlot index={2} />
                                                <InputOTPSlot index={3} />
                                                <InputOTPSlot index={4} />
                                                <InputOTPSlot index={5} />
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

            {error && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <div className="space-y-2">
                <Button
                    type="submit"
                    form={formId}
                    className="w-full"
                    loading={loading}
                    disabled={loading}
                >
                    {t("otpAuthSubmit")}
                </Button>
                <Button
                    type="button"
                    className="w-full"
                    variant="outline"
                    onClick={onBack}
                >
                    {t("otpAuthBack")}
                </Button>
            </div>
        </div>
    );
}
