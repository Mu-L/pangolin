"use client";

import { useEffect, useState } from "react";
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
import { toast } from "@app/hooks/useToast";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useTranslations } from "next-intl";

export type HealthCheckRow = {
    targetHealthCheckId: number;
    name: string;
    hcEnabled: boolean;
    hcHealth: "unknown" | "healthy" | "unhealthy";
    hcMode: string | null;
    hcHostname: string | null;
    hcPort: number | null;
    hcPath: string | null;
    hcScheme: string | null;
    hcMethod: string | null;
    hcInterval: number | null;
    hcUnhealthyInterval: number | null;
    hcTimeout: number | null;
    hcHeaders: string | null;
    hcFollowRedirects: boolean | null;
    hcStatus: number | null;
    hcTlsServerName: string | null;
    hcHealthyThreshold: number | null;
    hcUnhealthyThreshold: number | null;
};

type StandaloneHealthCheckCredenzaProps = {
    open: boolean;
    setOpen: (v: boolean) => void;
    orgId: string;
    initialValues?: HealthCheckRow | null;
    onSaved: () => void;
};

const DEFAULT_VALUES = {
    name: "",
    hcEnabled: true,
    hcMode: "http",
    hcScheme: "https",
    hcMethod: "GET",
    hcHostname: "",
    hcPort: "",
    hcPath: "/",
    hcInterval: 30,
    hcUnhealthyInterval: 30,
    hcTimeout: 5,
    hcHealthyThreshold: 1,
    hcUnhealthyThreshold: 1,
    hcFollowRedirects: true,
    hcTlsServerName: "",
    hcStatus: null as number | null,
    hcHeaders: [] as { name: string; value: string }[]
};

export default function StandaloneHealthCheckCredenza({
    open,
    setOpen,
    orgId,
    initialValues,
    onSaved
}: StandaloneHealthCheckCredenzaProps) {
    const t = useTranslations();
    const api = createApiClient(useEnvContext());
    const [loading, setLoading] = useState(false);

    const healthCheckSchema = z
        .object({
            name: z.string().min(1, { message: t("standaloneHcNameLabel") }),
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
                    { message: t("healthCheckPortInvalid") }
                ),
            hcFollowRedirects: z.boolean(),
            hcMode: z.string(),
            hcUnhealthyInterval: z.int().positive().min(5),
            hcTlsServerName: z.string(),
            hcHealthyThreshold: z
                .int()
                .positive()
                .min(1, { message: t("healthCheckHealthyThresholdMin") }),
            hcUnhealthyThreshold: z
                .int()
                .positive()
                .min(1, { message: t("healthCheckUnhealthyThresholdMin") })
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

    type FormValues = z.infer<typeof healthCheckSchema>;

    const form = useForm<FormValues>({
        resolver: zodResolver(healthCheckSchema),
        defaultValues: DEFAULT_VALUES
    });

    useEffect(() => {
        if (!open) return;

        if (initialValues) {
            let parsedHeaders: { name: string; value: string }[] = [];
            if (initialValues.hcHeaders) {
                try {
                    parsedHeaders = JSON.parse(initialValues.hcHeaders);
                } catch {
                    parsedHeaders = [];
                }
            }

            form.reset({
                name: initialValues.name,
                hcEnabled: initialValues.hcEnabled,
                hcMode: initialValues.hcMode ?? "http",
                hcScheme: initialValues.hcScheme ?? "https",
                hcMethod: initialValues.hcMethod ?? "GET",
                hcHostname: initialValues.hcHostname ?? "",
                hcPort: initialValues.hcPort
                    ? initialValues.hcPort.toString()
                    : "",
                hcPath: initialValues.hcPath ?? "/",
                hcInterval: initialValues.hcInterval ?? 30,
                hcUnhealthyInterval: initialValues.hcUnhealthyInterval ?? 30,
                hcTimeout: initialValues.hcTimeout ?? 5,
                hcHealthyThreshold: initialValues.hcHealthyThreshold ?? 1,
                hcUnhealthyThreshold: initialValues.hcUnhealthyThreshold ?? 1,
                hcFollowRedirects: initialValues.hcFollowRedirects ?? true,
                hcTlsServerName: initialValues.hcTlsServerName ?? "",
                hcStatus: initialValues.hcStatus ?? null,
                hcHeaders: parsedHeaders
            });
        } else {
            form.reset(DEFAULT_VALUES);
        }
    }, [open]);

    const watchedEnabled = form.watch("hcEnabled");
    const watchedMode = form.watch("hcMode");

    const onSubmit = async (values: FormValues) => {
        setLoading(true);
        try {
            const payload = {
                name: values.name,
                hcEnabled: values.hcEnabled,
                hcMode: values.hcMode,
                hcScheme: values.hcScheme,
                hcMethod: values.hcMethod,
                hcHostname: values.hcHostname,
                hcPort: parseInt(values.hcPort),
                hcPath: values.hcPath ?? "",
                hcInterval: values.hcInterval,
                hcUnhealthyInterval: values.hcUnhealthyInterval,
                hcTimeout: values.hcTimeout,
                hcHealthyThreshold: values.hcHealthyThreshold,
                hcUnhealthyThreshold: values.hcUnhealthyThreshold,
                hcFollowRedirects: values.hcFollowRedirects,
                hcTlsServerName: values.hcTlsServerName,
                hcStatus: values.hcStatus || null,
                hcHeaders:
                    values.hcHeaders && values.hcHeaders.length > 0
                        ? JSON.stringify(values.hcHeaders)
                        : null
            };

            if (initialValues) {
                await api.post(
                    `/org/${orgId}/health-check/${initialValues.targetHealthCheckId}`,
                    payload
                );
            } else {
                await api.put(
                    `/org/${orgId}/health-check`,
                    payload
                );
            }

            toast({ title: t("standaloneHcSaved") });
            onSaved();
            setOpen(false);
        } catch (e) {
            toast({
                title: t("error"),
                description: formatAxiosError(e),
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    const isEditing = !!initialValues;

    return (
        <Credenza open={open} onOpenChange={setOpen}>
            <CredenzaContent className="max-w-2xl">
                <CredenzaHeader>
                    <CredenzaTitle>
                        {isEditing
                            ? t("standaloneHcEditTitle")
                            : t("standaloneHcCreateTitle")}
                    </CredenzaTitle>
                    <CredenzaDescription>
                        {t("standaloneHcDescription")}
                    </CredenzaDescription>
                </CredenzaHeader>
                <CredenzaBody>
                    <Form {...form}>
                        <form
                            id="standalone-hc-form"
                            onSubmit={form.handleSubmit(onSubmit)}
                            className="space-y-6"
                        >
                            {/* Name */}
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>
                                            {t("standaloneHcNameLabel")}
                                        </FormLabel>
                                        <FormControl>
                                            <Input
                                                {...field}
                                                placeholder={t(
                                                    "standaloneHcNamePlaceholder"
                                                )}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* Enable Health Check */}
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
                                                onCheckedChange={field.onChange}
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
                                                    onValueChange={
                                                        field.onChange
                                                    }
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
                                                            <Input {...field} />
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
                                                            <Input {...field} />
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
                                                            onValueChange={
                                                                field.onChange
                                                            }
                                                            value={field.value}
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
                                                            <Input {...field} />
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
                                                            <Input {...field} />
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
                                                            <Input {...field} />
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
                                                        onValueChange={
                                                            field.onChange
                                                        }
                                                        value={field.value}
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
                                                            onChange={(e) =>
                                                                field.onChange(
                                                                    parseInt(
                                                                        e.target
                                                                            .value
                                                                    )
                                                                )
                                                            }
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
                                                            onChange={(e) =>
                                                                field.onChange(
                                                                    parseInt(
                                                                        e.target
                                                                            .value
                                                                    )
                                                                )
                                                            }
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
                                                            onChange={(e) =>
                                                                field.onChange(
                                                                    parseInt(
                                                                        e.target
                                                                            .value
                                                                    )
                                                                )
                                                            }
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
                                                            onChange={(e) =>
                                                                field.onChange(
                                                                    parseInt(
                                                                        e.target
                                                                            .value
                                                                    )
                                                                )
                                                            }
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
                                                            onChange={(e) =>
                                                                field.onChange(
                                                                    parseInt(
                                                                        e.target
                                                                            .value
                                                                    )
                                                                )
                                                            }
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
                                            {/* Expected Response Code */}
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
                                                                value={
                                                                    field.value ??
                                                                    ""
                                                                }
                                                                onChange={(
                                                                    e
                                                                ) => {
                                                                    const val =
                                                                        e.target
                                                                            .value;
                                                                    field.onChange(
                                                                        val
                                                                            ? parseInt(
                                                                                  val
                                                                              )
                                                                            : null
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

                                            {/* TLS Server Name */}
                                            <FormField
                                                control={form.control}
                                                name="hcTlsServerName"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            {t("tlsServerName")}
                                                        </FormLabel>
                                                        <FormControl>
                                                            <Input {...field} />
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
                                                                onChange={
                                                                    field.onChange
                                                                }
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

                                            {/* Follow Redirects */}
                                            <FormField
                                                control={form.control}
                                                name="hcFollowRedirects"
                                                render={({ field }) => (
                                                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                                        <div className="space-y-0.5">
                                                            <FormLabel>
                                                                {t(
                                                                    "followRedirects"
                                                                )}
                                                            </FormLabel>
                                                            <FormDescription>
                                                                {t(
                                                                    "followRedirectsDescription"
                                                                )}
                                                            </FormDescription>
                                                        </div>
                                                        <FormControl>
                                                            <Switch
                                                                checked={
                                                                    field.value
                                                                }
                                                                onCheckedChange={
                                                                    field.onChange
                                                                }
                                                            />
                                                        </FormControl>
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
                    <CredenzaClose asChild>
                        <Button variant="outline" type="button">
                            {t("cancel")}
                        </Button>
                    </CredenzaClose>
                    <Button
                        type="submit"
                        form="standalone-hc-form"
                        disabled={loading}
                    >
                        {t("save")}
                    </Button>
                </CredenzaFooter>
            </CredenzaContent>
        </Credenza>
    );
}
