"use client";

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
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useOrgContext } from "@app/hooks/useOrgContext";
import { usePaidStatus } from "@app/hooks/usePaidStatus";
import { toast } from "@app/hooks/useToast";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { build } from "@server/build";
import type { CreateRoleBody, CreateRoleResponse } from "@server/routers/role";
import { AxiosResponse } from "axios";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { PaidFeaturesAlert } from "./PaidFeaturesAlert";
import { CheckboxWithLabel } from "./ui/checkbox";
import { tierMatrix } from "@server/lib/billing/tierMatrix";

type CreateRoleFormProps = {
    open: boolean;
    setOpen: (open: boolean) => void;
    afterCreate?: (res: CreateRoleResponse) => void;
};

export default function CreateRoleForm({
    open,
    setOpen,
    afterCreate
}: CreateRoleFormProps) {
    const { org } = useOrgContext();
    const t = useTranslations();
    const { isPaidUser } = usePaidStatus();
    const { env } = useEnvContext();

    const formSchema = z.object({
        name: z
            .string({ message: t("nameRequired") })
            .min(1)
            .max(32),
        description: z.string().max(255).optional(),
        requireDeviceApproval: z.boolean().optional()
    });

    const api = createApiClient(useEnvContext());

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            description: "",
            requireDeviceApproval: false
        }
    });

    const [loading, startTransition] = useTransition();

    async function onSubmit(values: z.infer<typeof formSchema>) {
        const res = await api
            .put<
                AxiosResponse<CreateRoleResponse>
            >(`/org/${org?.org.orgId}/role`, values satisfies CreateRoleBody)
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

            afterCreate?.(res.data.data);
        }
    }

    return (
        <>
            <Credenza
                open={open}
                onOpenChange={(val) => {
                    setOpen(val);
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
                                onSubmit={form.handleSubmit((values) =>
                                    startTransition(() => onSubmit(values))
                                )}
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

                                {!env.flags.disableEnterpriseFeatures && (
                                    <>
                                        <PaidFeaturesAlert
                                            tiers={tierMatrix.deviceApprovals}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="requireDeviceApproval"
                                            render={({ field }) => (
                                                <FormItem className="my-2">
                                                    <FormControl>
                                                        <CheckboxWithLabel
                                                            {...field}
                                                            disabled={
                                                                !isPaidUser(
                                                                    tierMatrix.deviceApprovals
                                                                )
                                                            }
                                                            value="on"
                                                            checked={form.watch(
                                                                "requireDeviceApproval"
                                                            )}
                                                            onCheckedChange={(
                                                                checked
                                                            ) => {
                                                                if (
                                                                    checked !==
                                                                    "indeterminate"
                                                                ) {
                                                                    form.setValue(
                                                                        "requireDeviceApproval",
                                                                        checked
                                                                    );
                                                                }
                                                            }}
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
                                    </>
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
