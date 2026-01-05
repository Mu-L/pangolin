"use client";

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
import { Input } from "@app/components/ui/input";
import { toast } from "@app/hooks/useToast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
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
import { formatAxiosError } from "@app/lib/api";
import { AxiosResponse } from "axios";
import { Resource } from "@server/db";
import { createApiClient } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useTranslations } from "next-intl";

const setPasswordFormSchema = z.object({
    password: z.string().min(4).max(100)
});

type SetPasswordFormValues = z.infer<typeof setPasswordFormSchema>;

type SetPasswordFormProps = {
    open: boolean;
    setOpen: (open: boolean) => void;
    resourceId: number;
    onSetPassword?: () => void;
};

export default function SetResourcePasswordForm({
    open,
    setOpen,
    resourceId,
    onSetPassword
}: SetPasswordFormProps) {
    const api = createApiClient(useEnvContext());
    const t = useTranslations();

    const [loading, setLoading] = useState(false);

    const form = useForm({
        resolver: zodResolver(setPasswordFormSchema),
        defaultValues: {
            password: ""
        }
    });

    useEffect(() => {
        if (!open) {
            return;
        }

        form.reset();
    }, [open]);

    async function onSubmit(data: SetPasswordFormValues) {
        setLoading(true);

        api.post<AxiosResponse<Resource>>(`/resource/${resourceId}/password`, {
            password: data.password
        })
            .then(() => {
                toast({
                    title: t("resourcePasswordSetup"),
                    description: t("resourcePasswordSetupDescription")
                });

                if (onSetPassword) {
                    onSetPassword();
                }
            })
            .catch((e) => {
                toast({
                    variant: "destructive",
                    title: t("resourceErrorPasswordSetup"),
                    description: formatAxiosError(
                        e,
                        t("resourceErrorPasswordSetupDescription")
                    )
                });
            })
            .finally(() => setLoading(false));
    }

    return (
        <>
            <Credenza
                open={open}
                onOpenChange={(val) => {
                    setOpen(val);
                    setLoading(false);
                    form.reset();
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
                        <Form {...form}>
                            <form
                                onSubmit={form.handleSubmit(onSubmit)}
                                className="space-y-4"
                                id="set-password-form"
                            >
                                <FormField
                                    control={form.control}
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
                        <Button
                            type="submit"
                            form="set-password-form"
                            loading={loading}
                            disabled={loading}
                        >
                            {t("resourcePasswordSubmit")}
                        </Button>
                    </CredenzaFooter>
                </CredenzaContent>
            </Credenza>
        </>
    );
}
