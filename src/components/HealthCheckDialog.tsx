"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { HeadersInput } from "@app/components/HeadersInput";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@/components/ui/form";
import {
    Credenza,
    CredenzaBody,
    CredenzaClose,
    CredenzaContent,
    CredenzaDescription,
    CredenzaFooter,
    CredenzaHeader,
    CredenzaTitle
} from "@/components/Credenza";
import { toast } from "@/hooks/useToast";
import { useTranslations } from "next-intl";

type HealthCheckConfig = {
    hcEnabled: boolean;
    hcPath: string;
    hcMethod: string;
    hcInterval: number;
    hcTimeout: number;
    hcStatus: number | null;
    hcHeaders?: { name: string; value: string }[] | null;
    hcScheme?: string;
    hcHostname: string;
    hcPort: number;
    hcFollowRedirects: boolean;
    hcMode: string;
    hcUnhealthyInterval: number;
    hcTlsServerName: string;
    hcHealthyThreshold: number;
    hcUnhealthyThreshold: number;
};

type HealthCheckDialogProps = {
    open: boolean;
    setOpen: (val: boolean) => void;
    targetId: number;
    targetAddress: string;
    targetMethod?: string;
    initialConfig?: Partial<HealthCheckConfig>;
    onChanges: (config: HealthCheckConfig) => Promise<void>;
};

export default function HealthCheckDialog({
    open,
    setOpen,
    targetId,
    targetAddress,
    targetMethod,
    initialConfig,
    onChanges
}: HealthCheckDialogProps) {
    const t = useTranslations();

    const healthCheckSchema = z
        .object({
            hcEnabled: z.boolean(),
            hcPath: z.string().optional(),
            hcMethod: z.string().optional(),
            hcInterval: z
                .int()
                .positive()
                .min(5, { message: t("healthCheckIntervalMin") }),
            hcTimeout: z
                .int()
                .positive()
                .min(1, { message: t("healthCheckTimeoutMin") }),
            hcStatus: z.int().positive().min(100).optional().nullable(),
            hcHeaders: z
                .array(z.object({ name: z.string(), value: z.string() }))
                .nullable()
                .optional(),
            hcScheme: z.string().optional(),
            hcHostname: z.string(),
            hcPort: z
                .string()
                .min(1, { message: t("healthCheckPortInvalid") })
                .refine(
                    (val) => {
                        const port = parseInt(val);
                        return port > 0 && port <= 65535;
                    },
                    {
                        message: t("healthCheckPortInvalid")
                    }
                ),
            hcFollowRedirects: z.boolean(),
            hcMode: z.string(),
            hcUnhealthyInterval: z.int().positive().min(5),
            hcTlsServerName: z.string(),
            hcHealthyThreshold: z
                .int()
                .positive()
                .min(1, {
                    message: t("healthCheckHealthyThresholdMin")
                }),
            hcUnhealthyThreshold: z
                .int()
                .positive()
                .min(1, {
                    message: t("healthCheckUnhealthyThresholdMin")
                })
        })
        .superRefine((data, ctx) => {
            if (data.hcMode !== "tcp") {
                if (!data.hcPath || data.hcPath.length < 1) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: t("healthCheckPathRequired"),
                        path: ["hcPath"]
                    });
                }
                if (!data.hcMethod || data.hcMethod.length < 1) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: t("healthCheckMethodRequired"),
                        path: ["hcMethod"]
                    });
                }
            }
        });

    const form = useForm<z.infer<typeof healthCheckSchema>>({
        resolver: zodResolver(healthCheckSchema),
        defaultValues: {}
    });

    useEffect(() => {
        if (!open) return;

        const getDefaultScheme = () => {
            if (initialConfig?.hcScheme) {
                return initialConfig.hcScheme;
            }
            if (targetMethod === "https") {
                return "https";
            }
            return "http";
        };

        form.reset({
            hcEnabled: initialConfig?.hcEnabled,
            hcPath: initialConfig?.hcPath,
            hcMethod: initialConfig?.hcMethod,
            hcInterval: initialConfig?.hcInterval,
            hcTimeout: initialConfig?.hcTimeout,
            hcStatus: initialConfig?.hcStatus,
            hcHeaders: initialConfig?.hcHeaders,
            hcScheme: getDefaultScheme(),
            hcHostname: initialConfig?.hcHostname,
            hcPort: initialConfig?.hcPort
                ? initialConfig.hcPort.toString()
                : "",
            hcFollowRedirects: initialConfig?.hcFollowRedirects,
            hcMode: initialConfig?.hcMode ?? "http",
            hcUnhealthyInterval: initialConfig?.hcUnhealthyInterval,
            hcTlsServerName: initialConfig?.hcTlsServerName ?? "",
            hcHealthyThreshold: initialConfig?.hcHealthyThreshold ?? 1,
            hcUnhealthyThreshold: initialConfig?.hcUnhealthyThreshold ?? 1
        });
    }, [open]);

    const watchedEnabled = form.watch("hcEnabled");
    const watchedMode = form.watch("hcMode");

    const handleFieldChange = async (fieldName: string, value: any) => {
        try {
            const currentValues = form.getValues();
            const updatedValues = { ...currentValues, [fieldName]: value };

            const configToSend: HealthCheckConfig = {
                ...updatedValues,
                hcPath: updatedValues.hcPath ?? "",
                hcMethod: updatedValues.hcMethod ?? "",
                hcPort: parseInt(updatedValues.hcPort),
                hcStatus: updatedValues.hcStatus || null,
                hcHealthyThreshold: updatedValues.hcHealthyThreshold,
                hcUnhealthyThreshold: updatedValues.hcUnhealthyThreshold
            };

            await onChanges(configToSend);
        } catch (error) {
            toast({
                title: t("healthCheckError"),
                description: t("healthCheckErrorDescription"),
                variant: "destructive"
            });
        }
    };

    return (
        <Credenza open={open} onOpenChange={setOpen}>
            <CredenzaContent className="max-w-2xl">
                <CredenzaHeader>
                    <CredenzaTitle>{t("configureHealthCheck")}</CredenzaTitle>
                    <CredenzaDescription>
                        {t("configureHealthCheckDescription", {
                            target: targetAddress
                        })}
                    </CredenzaDescription>
                </CredenzaHeader>
                <CredenzaBody>
                    <Form {...form}>
                        <form className="space-y-6">
                            {/* Enable Health Checks */}
                            <FormField
                                control={form.control}
                                name="hcEnabled"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                        <div className="space-y-0.5">
                                            <FormLabel>
                                                {t("enableHealthChecks")}
                                            </FormLabel>
                                            <FormDescription>
                                                {t(
                                                    "enableHealthChecksDescription"
                                                )}
                                            </FormDescription>
                                        </div>
                                        <FormControl>
                                            <Switch
                                                checked={field.value}
                                                onCheckedChange={(value) => {
                                                    field.onChange(value);
                                                    handleFieldChange(
                                                        "hcEnabled",
                                                        value
                                                    );
                                                }}
                                            />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />

                            {watchedEnabled && (
                                <div className="space-y-4">
                                    {/* Mode */}
                                    <FormField
                                        control={form.control}
                                        name="hcMode"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>
                                                    {t("healthCheckMode")}
                                                </FormLabel>
                                                <Select
                                                    onValueChange={(value) => {
                                                        field.onChange(value);
                                                        handleFieldChange(
                                                            "hcMode",
                                                            value
                                                        );
                                                    }}
                                                    value={field.value}
                                                >
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="http">
                                                            HTTP
                                                        </SelectItem>
                                                        <SelectItem value="tcp">
                                                            TCP
                                                        </SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormDescription>
                                                    {t(
                                                        "healthCheckModeDescription"
                                                    )}
                                                </FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    {/* Connection fields */}
                                    {watchedMode === "tcp" ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <FormField
                                                control={form.control}
                                                name="hcHostname"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            {t("healthHostname")}
                                                        </FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                {...field}
                                                                onChange={(
                                                                    e
                                                                ) => {
                                                                    field.onChange(
                                                                        e
                                                                    );
                                                                    handleFieldChange(
                                                                        "hcHostname",
                                                                        e.target
                                                                            .value
                                                                    );
                                                                }}
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control}
                                                name="hcPort"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            {t("healthPort")}
                                                        </FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                {...field}
                                                                onChange={(
                                                                    e
                                                                ) => {
                                                                    const value =
                                                                        e.target
                                                                            .value;
                                                                    field.onChange(
                                                                        value
                                                                    );
                                                                    handleFieldChange(
                                                                        "hcPort",
                                                                        value
                                                                    );
                                                                }}
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                            <FormField
                                                control={form.control}
                                                name="hcScheme"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            {t("healthScheme")}
                                                        </FormLabel>
                                                        <Select
                                                            onValueChange={(
                                                                value
                                                            ) => {
                                                                field.onChange(
                                                                    value
                                                                );
                                                                handleFieldChange(
                                                                    "hcScheme",
                                                                    value
                                                                );
                                                            }}
                                                            defaultValue={
                                                                field.value
                                                            }
                                                        >
                                                            <FormControl>
                                                                <SelectTrigger>
                                                                    <SelectValue
                                                                        placeholder={t(
                                                                            "healthSelectScheme"
                                                                        )}
                                                                    />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                <SelectItem value="http">
                                                                    HTTP
                                                                </SelectItem>
                                                                <SelectItem value="https">
                                                                    HTTPS
                                                                </SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control}
                                                name="hcHostname"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            {t("healthHostname")}
                                                        </FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                {...field}
                                                                onChange={(
                                                                    e
                                                                ) => {
                                                                    field.onChange(
                                                                        e
                                                                    );
                                                                    handleFieldChange(
                                                                        "hcHostname",
                                                                        e.target
                                                                            .value
                                                                    );
                                                                }}
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control}
                                                name="hcPort"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            {t("healthPort")}
                                                        </FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                {...field}
                                                                onChange={(
                                                                    e
                                                                ) => {
                                                                    const value =
                                                                        e.target
                                                                            .value;
                                                                    field.onChange(
                                                                        value
                                                                    );
                                                                    handleFieldChange(
                                                                        "hcPort",
                                                                        value
                                                                    );
                                                                }}
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control}
                                                name="hcPath"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            {t("healthCheckPath")}
                                                        </FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                {...field}
                                                                onChange={(
                                                                    e
                                                                ) => {
                                                                    field.onChange(
                                                                        e
                                                                    );
                                                                    handleFieldChange(
                                                                        "hcPath",
                                                                        e.target
                                                                            .value
                                                                    );
                                                                }}
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </div>
                                    )}

                                    {/* HTTP Method */}
                                    {watchedMode !== "tcp" && (
                                        <FormField
                                            control={form.control}
                                            name="hcMethod"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>
                                                        {t("httpMethod")}
                                                    </FormLabel>
                                                    <Select
                                                        onValueChange={(
                                                            value
                                                        ) => {
                                                            field.onChange(
                                                                value
                                                            );
                                                            handleFieldChange(
                                                                "hcMethod",
                                                                value
                                                            );
                                                        }}
                                                        defaultValue={
                                                            field.value
                                                        }
                                                    >
                                                        <FormControl>
                                                            <SelectTrigger>
                                                                <SelectValue
                                                                    placeholder={t(
                                                                        "selectHttpMethod"
                                                                    )}
                                                                />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            <SelectItem value="GET">
                                                                GET
                                                            </SelectItem>
                                                            <SelectItem value="POST">
                                                                POST
                                                            </SelectItem>
                                                            <SelectItem value="HEAD">
                                                                HEAD
                                                            </SelectItem>
                                                            <SelectItem value="PUT">
                                                                PUT
                                                            </SelectItem>
                                                            <SelectItem value="DELETE">
                                                                DELETE
                                                            </SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    )}

                                    {/* Check Interval, Unhealthy Interval, and Timeout */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <FormField
                                            control={form.control}
                                            name="hcInterval"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>
                                                        {t(
                                                            "healthyIntervalSeconds"
                                                        )}
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="number"
                                                            {...field}
                                                            onChange={(e) => {
                                                                const value =
                                                                    parseInt(
                                                                        e.target
                                                                            .value
                                                                    );
                                                                field.onChange(
                                                                    value
                                                                );
                                                                handleFieldChange(
                                                                    "hcInterval",
                                                                    value
                                                                );
                                                            }}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="hcUnhealthyInterval"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>
                                                        {t(
                                                            "unhealthyIntervalSeconds"
                                                        )}
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="number"
                                                            {...field}
                                                            onChange={(e) => {
                                                                const value =
                                                                    parseInt(
                                                                        e.target
                                                                            .value
                                                                    );
                                                                field.onChange(
                                                                    value
                                                                );
                                                                handleFieldChange(
                                                                    "hcUnhealthyInterval",
                                                                    value
                                                                );
                                                            }}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="hcTimeout"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>
                                                        {t("timeoutSeconds")}
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="number"
                                                            {...field}
                                                            onChange={(e) => {
                                                                const value =
                                                                    parseInt(
                                                                        e.target
                                                                            .value
                                                                    );
                                                                field.onChange(
                                                                    value
                                                                );
                                                                handleFieldChange(
                                                                    "hcTimeout",
                                                                    value
                                                                );
                                                            }}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>

                                    {/* Healthy and Unhealthy Thresholds */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <FormField
                                            control={form.control}
                                            name="hcHealthyThreshold"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>
                                                        {t("healthyThreshold")}
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="number"
                                                            {...field}
                                                            onChange={(e) => {
                                                                const value =
                                                                    parseInt(
                                                                        e.target
                                                                            .value
                                                                    );
                                                                field.onChange(
                                                                    value
                                                                );
                                                                handleFieldChange(
                                                                    "hcHealthyThreshold",
                                                                    value
                                                                );
                                                            }}
                                                        />
                                                    </FormControl>
                                                    <FormDescription>
                                                        {t(
                                                            "healthyThresholdDescription"
                                                        )}
                                                    </FormDescription>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="hcUnhealthyThreshold"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>
                                                        {t("unhealthyThreshold")}
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="number"
                                                            {...field}
                                                            onChange={(e) => {
                                                                const value =
                                                                    parseInt(
                                                                        e.target
                                                                            .value
                                                                    );
                                                                field.onChange(
                                                                    value
                                                                );
                                                                handleFieldChange(
                                                                    "hcUnhealthyThreshold",
                                                                    value
                                                                );
                                                            }}
                                                        />
                                                    </FormControl>
                                                    <FormDescription>
                                                        {t(
                                                            "unhealthyThresholdDescription"
                                                        )}
                                                    </FormDescription>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>

                                    {/* HTTP-only fields */}
                                    {watchedMode !== "tcp" && (
                                        <>
                                            {/* Expected Response Codes */}
                                            <FormField
                                                control={form.control}
                                                name="hcStatus"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            {t(
                                                                "expectedResponseCodes"
                                                            )}
                                                        </FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                type="number"
                                                                {...field}
                                                                value={
                                                                    field.value ||
                                                                    ""
                                                                }
                                                                onChange={(
                                                                    e
                                                                ) => {
                                                                    const value =
                                                                        parseInt(
                                                                            e
                                                                                .target
                                                                                .value
                                                                        );
                                                                    field.onChange(
                                                                        value
                                                                    );
                                                                    handleFieldChange(
                                                                        "hcStatus",
                                                                        value
                                                                    );
                                                                }}
                                                            />
                                                        </FormControl>
                                                        <FormDescription>
                                                            {t(
                                                                "expectedResponseCodesDescription"
                                                            )}
                                                        </FormDescription>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />

                                            {/* TLS Server Name (SNI) */}
                                            <FormField
                                                control={form.control}
                                                name="hcTlsServerName"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            {t("tlsServerName")}
                                                        </FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                {...field}
                                                                onChange={(
                                                                    e
                                                                ) => {
                                                                    field.onChange(
                                                                        e
                                                                    );
                                                                    handleFieldChange(
                                                                        "hcTlsServerName",
                                                                        e.target
                                                                            .value
                                                                    );
                                                                }}
                                                            />
                                                        </FormControl>
                                                        <FormDescription>
                                                            {t(
                                                                "tlsServerNameDescription"
                                                            )}
                                                        </FormDescription>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />

                                            {/* Custom Headers */}
                                            <FormField
                                                control={form.control}
                                                name="hcHeaders"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            {t("customHeaders")}
                                                        </FormLabel>
                                                        <FormControl>
                                                            <HeadersInput
                                                                value={
                                                                    field.value
                                                                }
                                                                onChange={(
                                                                    value
                                                                ) => {
                                                                    field.onChange(
                                                                        value
                                                                    );
                                                                    handleFieldChange(
                                                                        "hcHeaders",
                                                                        value
                                                                    );
                                                                }}
                                                                rows={4}
                                                            />
                                                        </FormControl>
                                                        <FormDescription>
                                                            {t(
                                                                "customHeadersDescription"
                                                            )}
                                                        </FormDescription>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </>
                                    )}
                                </div>
                            )}
                        </form>
                    </Form>
                </CredenzaBody>
                <CredenzaFooter>
                    <Button onClick={() => setOpen(false)}>{t("done")}</Button>
                </CredenzaFooter>
            </CredenzaContent>
        </Credenza>
    );
}