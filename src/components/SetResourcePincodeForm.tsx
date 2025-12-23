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
import {
    InputOTP,
    InputOTPGroup,
    InputOTPSlot
} from "@app/components/ui/input-otp";
import { createApiClient } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useTranslations } from "next-intl";

const setPincodeFormSchema = z.object({
    pincode: z.string().length(6)
});

type SetPincodeFormValues = z.infer<typeof setPincodeFormSchema>;

type SetPincodeFormProps = {
    open: boolean;
    setOpen: (open: boolean) => void;
    resourceId: number;
    onSetPincode?: () => void;
};

export default function SetResourcePincodeForm({
    open,
    setOpen,
    resourceId,
    onSetPincode
}: SetPincodeFormProps) {
    const [loading, setLoading] = useState(false);

    const api = createApiClient(useEnvContext());

    const form = useForm({
        resolver: zodResolver(setPincodeFormSchema),
        defaultValues: {
            pincode: ""
        }
    });

    const t = useTranslations();

    useEffect(() => {
        if (!open) {
            return;
        }

        form.reset();
    }, [open]);

    async function onSubmit(data: SetPincodeFormValues) {
        setLoading(true);

        api.post<AxiosResponse<Resource>>(`/resource/${resourceId}/pincode`, {
            pincode: data.pincode
        })
            .then(() => {
                toast({
                    title: t("resourcePincodeSetup"),
                    description: t("resourcePincodeSetupDescription")
                });

                if (onSetPincode) {
                    onSetPincode();
                }
            })
            .catch((e) => {
                toast({
                    variant: "destructive",
                    title: t("resourceErrorPincodeSetup"),
                    description: formatAxiosError(
                        e,
                        t("resourceErrorPincodeSetupDescription")
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
                            {t("resourcePincodeSetupTitle")}
                        </CredenzaTitle>
                        <CredenzaDescription>
                            {t("resourcePincodeSetupTitleDescription")}
                        </CredenzaDescription>
                    </CredenzaHeader>
                    <CredenzaBody>
                        <Form {...form}>
                            <form
                                onSubmit={form.handleSubmit(onSubmit)}
                                className="space-y-4"
                                id="set-pincode-form"
                            >
                                <FormField
                                    control={form.control}
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
                        <Button
                            type="submit"
                            form="set-pincode-form"
                            loading={loading}
                            disabled={loading}
                        >
                            {t("resourcePincodeSubmit")}
                        </Button>
                    </CredenzaFooter>
                </CredenzaContent>
            </Credenza>
        </>
    );
}
