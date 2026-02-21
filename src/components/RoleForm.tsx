"use client";

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
import {
    OptionSelect,
    type OptionSelectOption
} from "@app/components/OptionSelect";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { usePaidStatus } from "@app/hooks/usePaidStatus";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { HorizontalTabs } from "@app/components/HorizontalTabs";
import { PaidFeaturesAlert } from "./PaidFeaturesAlert";
import { CheckboxWithLabel } from "./ui/checkbox";
import { tierMatrix } from "@server/lib/billing/tierMatrix";
import type { Role } from "@server/db";

export const SSH_SUDO_MODE_VALUES = ["none", "full", "commands"] as const;
export type SshSudoMode = (typeof SSH_SUDO_MODE_VALUES)[number];

function parseRoleJsonArray(value: string | null | undefined): string[] {
    if (value == null || value === "") return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function toSshSudoMode(value: string | null | undefined): SshSudoMode {
    if (value === "none" || value === "full" || value === "commands")
        return value;
    return "none";
}

export type RoleFormValues = {
    name: string;
    description?: string;
    requireDeviceApproval?: boolean;
    allowSsh?: boolean;
    sshSudoMode: SshSudoMode;
    sshSudoCommands?: string;
    sshCreateHomeDir?: boolean;
    sshUnixGroups?: string;
};

type RoleFormProps = {
    variant: "create" | "edit";
    role?: Role;
    onSubmit: (values: RoleFormValues) => void | Promise<void>;
    formId?: string;
};

export function RoleForm({
    variant,
    role,
    onSubmit,
    formId = "create-role-form"
}: RoleFormProps) {
    const t = useTranslations();
    const { isPaidUser } = usePaidStatus();
    const { env } = useEnvContext();

    const formSchema = z.object({
        name: z
            .string({ message: t("nameRequired") })
            .min(1)
            .max(32),
        description: z.string().max(255).optional(),
        requireDeviceApproval: z.boolean().optional(),
        allowSsh: z.boolean().optional(),
        sshSudoMode: z.enum(SSH_SUDO_MODE_VALUES),
        sshSudoCommands: z.string().optional(),
        sshCreateHomeDir: z.boolean().optional(),
        sshUnixGroups: z.string().optional()
    });

    const defaultValues: RoleFormValues = role
        ? {
              name: role.name,
              description: role.description ?? "",
              requireDeviceApproval: role.requireDeviceApproval ?? false,
              allowSsh:
                  (role as Role & { allowSsh?: boolean }).allowSsh ?? false,
              sshSudoMode: toSshSudoMode(role.sshSudoMode),
              sshSudoCommands: parseRoleJsonArray(role.sshSudoCommands).join(
                  ", "
              ),
              sshCreateHomeDir: role.sshCreateHomeDir ?? false,
              sshUnixGroups: parseRoleJsonArray(role.sshUnixGroups).join(", ")
          }
        : {
              name: "",
              description: "",
              requireDeviceApproval: false,
              allowSsh: false,
              sshSudoMode: "none",
              sshSudoCommands: "",
              sshCreateHomeDir: true,
              sshUnixGroups: ""
          };

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues
    });

    useEffect(() => {
        if (variant === "edit" && role) {
            form.reset({
                name: role.name,
                description: role.description ?? "",
                requireDeviceApproval: role.requireDeviceApproval ?? false,
                allowSsh:
                    (role as Role & { allowSsh?: boolean }).allowSsh ?? false,
                sshSudoMode: toSshSudoMode(role.sshSudoMode),
                sshSudoCommands: parseRoleJsonArray(role.sshSudoCommands).join(
                    ", "
                ),
                sshCreateHomeDir: role.sshCreateHomeDir ?? false,
                sshUnixGroups: parseRoleJsonArray(role.sshUnixGroups).join(", ")
            });
        }
    }, [variant, role, form]);

    const sshDisabled = !isPaidUser(tierMatrix.sshPam);
    const sshSudoMode = form.watch("sshSudoMode");

    useEffect(() => {
        if (sshDisabled) {
            form.setValue("allowSsh", false);
        }
    }, [sshDisabled, form]);

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit((values) => onSubmit(values))}
                className="space-y-4"
                id={formId}
            >
                {env.flags.disableEnterpriseFeatures ? (
                    <div className="space-y-4 mt-4">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t("accessRoleName")}</FormLabel>
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
                                    <FormLabel>{t("description")}</FormLabel>
                                    <FormControl>
                                        <Input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                ) : (
                    <HorizontalTabs
                        clientSide={true}
                        defaultTab={0}
                        items={[
                            { title: t("general"), href: "#" },
                            ...(env.flags.disableEnterpriseFeatures
                                ? []
                                : [{ title: t("sshAccess"), href: "#" }])
                        ]}
                    >
                        {/* General tab */}
                        <div className="space-y-4 mt-4">
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
                                                onCheckedChange={(checked) => {
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
                        </div>

                        {/* SSH tab - hidden when enterprise features are disabled */}
                        {!env.flags.disableEnterpriseFeatures && (
                            <div className="space-y-4 mt-4">
                                <PaidFeaturesAlert tiers={tierMatrix.sshPam} />
                                <FormField
                                    control={form.control}
                                    name="allowSsh"
                                    render={({ field }) => {
                                        const allowSshOptions: OptionSelectOption<"allow" | "disallow">[] = [
                                            {
                                                value: "allow",
                                                label: t("roleAllowSshAllow")
                                            },
                                            {
                                                value: "disallow",
                                                label: t("roleAllowSshDisallow")
                                            }
                                        ];
                                        return (
                                            <FormItem>
                                                <FormLabel>
                                                    {t("roleAllowSsh")}
                                                </FormLabel>
                                                <OptionSelect<"allow" | "disallow">
                                                    options={allowSshOptions}
                                                    value={
                                                        sshDisabled
                                                            ? "disallow"
                                                            : field.value
                                                              ? "allow"
                                                              : "disallow"
                                                    }
                                                    onChange={(v) => {
                                                        if (sshDisabled) return;
                                                        field.onChange(v === "allow");
                                                    }}
                                                    cols={2}
                                                    disabled={sshDisabled}
                                                />
                                                <FormDescription>
                                                    {t(
                                                        "roleAllowSshDescription"
                                                    )}
                                                </FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        );
                                    }}
                                />
                                <FormField
                                    control={form.control}
                                    name="sshSudoMode"
                                    render={({ field }) => {
                                        const sudoOptions: OptionSelectOption<SshSudoMode>[] =
                                            [
                                                {
                                                    value: "none",
                                                    label: t("sshSudoModeNone")
                                                },
                                                {
                                                    value: "full",
                                                    label: t("sshSudoModeFull")
                                                },
                                                {
                                                    value: "commands",
                                                    label: t(
                                                        "sshSudoModeCommands"
                                                    )
                                                }
                                            ];
                                        return (
                                            <FormItem>
                                                <FormLabel>
                                                    {t("sshSudoMode")}
                                                </FormLabel>
                                                <OptionSelect<SshSudoMode>
                                                    options={sudoOptions}
                                                    value={field.value}
                                                    onChange={field.onChange}
                                                    cols={3}
                                                    disabled={sshDisabled}
                                                />
                                                <FormMessage />
                                            </FormItem>
                                        );
                                    }}
                                />
                                {sshSudoMode === "commands" && (
                                    <FormField
                                        control={form.control}
                                        name="sshSudoCommands"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>
                                                    {t("sshSudoCommands")}
                                                </FormLabel>
                                                <FormControl>
                                                    <Input
                                                        {...field}
                                                        disabled={sshDisabled}
                                                    />
                                                </FormControl>
                                                <FormDescription>
                                                    {t(
                                                        "sshSudoCommandsDescription"
                                                    )}
                                                </FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                )}

                                <FormField
                                    control={form.control}
                                    name="sshUnixGroups"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                {t("sshUnixGroups")}
                                            </FormLabel>
                                            <FormControl>
                                                <Input
                                                    {...field}
                                                    disabled={sshDisabled}
                                                />
                                            </FormControl>
                                            <FormDescription>
                                                {t("sshUnixGroupsDescription")}
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="sshCreateHomeDir"
                                    render={({ field }) => (
                                        <FormItem className="my-2">
                                            <FormControl>
                                                <CheckboxWithLabel
                                                    {...field}
                                                    value="on"
                                                    checked={form.watch(
                                                        "sshCreateHomeDir"
                                                    )}
                                                    onCheckedChange={(
                                                        checked
                                                    ) => {
                                                        if (
                                                            checked !==
                                                            "indeterminate"
                                                        ) {
                                                            form.setValue(
                                                                "sshCreateHomeDir",
                                                                checked
                                                            );
                                                        }
                                                    }}
                                                    label={t(
                                                        "sshCreateHomeDir"
                                                    )}
                                                    disabled={sshDisabled}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        )}
                    </HorizontalTabs>
                )}
            </form>
        </Form>
    );
}
