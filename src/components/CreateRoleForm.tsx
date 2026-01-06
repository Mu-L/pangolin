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
import { AxiosResponse } from "axios";
import { useState } from "react";
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
import { useOrgContext } from "@app/hooks/useOrgContext";
import type { CreateRoleBody, CreateRoleResponse } from "@server/routers/role";
import { formatAxiosError } from "@app/lib/api";
import { createApiClient } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useTranslations } from "next-intl";
import { CheckboxWithLabel } from "./ui/checkbox";
import { usePaidStatus } from "@app/hooks/usePaidStatus";

type CreateRoleFormProps = {
    open: boolean;
    setOpen: (open: boolean) => void;
    afterCreate?: (res: CreateRoleResponse) => Promise<void>;
};

export default function CreateRoleForm({
    open,
    setOpen,
    afterCreate
}: CreateRoleFormProps) {
    const { org } = useOrgContext();
    const t = useTranslations();
    const { isPaidUser } = usePaidStatus();

    const formSchema = z.object({
        name: z.string({ message: t("nameRequired") }).max(32),
        description: z.string().max(255).optional(),
        requireDeviceApproval: z.boolean().optional()
    });

    const [loading, setLoading] = useState(false);

    const api = createApiClient(useEnvContext());

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            description: "",
            requireDeviceApproval: false
        }
    });

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setLoading(true);

        const res = await api
            .put<AxiosResponse<CreateRoleResponse>>(
                `/org/${org?.org.orgId}/role`,
                {
                    name: values.name,
                    description: values.description
                } as CreateRoleBody
            )
            .catch((e) => {
                toast({
                    variant: "destructive",
                    title: t("accessRoleErrorCreate"),
                    description: formatAxiosError(
                        e,
                        t("accessRoleErrorCreateDescription")
                    )
                });
            });

        if (res && res.status === 201) {
            toast({
                variant: "default",
                title: t("accessRoleCreated"),
                description: t("accessRoleCreatedDescription")
            });

            if (open) {
                setOpen(false);
            }

            if (afterCreate) {
                afterCreate(res.data.data);
            }
        }

        setLoading(false);
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
                        <CredenzaTitle>{t("accessRoleCreate")}</CredenzaTitle>
                        <CredenzaDescription>
                            {t("accessRoleCreateDescription")}
                        </CredenzaDescription>
                    </CredenzaHeader>
                    <CredenzaBody>
                        <Form {...form}>
                            <form
                                onSubmit={form.handleSubmit(onSubmit)}
                                className="space-y-4"
                                id="create-role-form"
                            >
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                {t("accessRoleName")}
                                            </FormLabel>
                                            <FormControl>
                                                <Input {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="description"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                {t("description")}
                                            </FormLabel>
                                            <FormControl>
                                                <Input {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                {isPaidUser && (
                                    <FormField
                                        control={form.control}
                                        name="requireDeviceApproval"
                                        render={({ field }) => (
                                            <FormItem className="pt-3">
                                                <FormControl>
                                                    <CheckboxWithLabel
                                                        {...field}
                                                        value={undefined}
                                                        defaultChecked={
                                                            field.value
                                                        }
                                                        label={t(
                                                            "requireDeviceApproval"
                                                        )}
                                                    />
                                                </FormControl>

                                                <FormDescription>
                                                    {t(
                                                        "requireDeviceApprovalDescription"
                                                    )}
                                                </FormDescription>

                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                )}
                            </form>
                        </Form>
                    </CredenzaBody>
                    <CredenzaFooter>
                        <CredenzaClose asChild>
                            <Button variant="outline">{t("close")}</Button>
                        </CredenzaClose>
                        <Button
                            type="submit"
                            form="create-role-form"
                            loading={loading}
                            disabled={loading}
                        >
                            {t("accessRoleCreateSubmit")}
                        </Button>
                    </CredenzaFooter>
                </CredenzaContent>
            </Credenza>
        </>
    );
}
