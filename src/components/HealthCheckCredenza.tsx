"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form } from "@/components/ui/form";
import { HealthCheckFormFields } from "@app/components/HealthCheckFormFields";
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

export type HealthCheckConfig = {
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

export type HealthCheckCredenzaProps =
    | {
          mode: "autoSave";
          open: boolean;
          setOpen: (v: boolean) => void;
          orgId?: string;
          targetAddress: string;
          targetMethod?: string;
          initialConfig?: Partial<HealthCheckConfig>;
          onChanges: (config: HealthCheckConfig) => Promise<void>;
      }
    | {
          mode: "submit";
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

export function HealthCheckCredenza(props: HealthCheckCredenzaProps) {
    const { mode, open, setOpen, orgId } = props;

    const t = useTranslations();
    const api = createApiClient(useEnvContext());
    const [loading, setLoading] = useState(false);

    const healthCheckSchema = z
        .object({
            ...(mode === "submit"
                ? {
                      name: z
                          .string()
                          .min(1, { message: t("standaloneHcNameLabel") })
                  }
                : {}),
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
        defaultValues: mode === "submit" ? DEFAULT_VALUES : {}
    });

    useEffect(() => {
        if (!open) return;

        if (mode === "autoSave") {
            const { initialConfig, targetMethod } = props;

            const getDefaultScheme = () => {
                if (initialConfig?.hcScheme) return initialConfig.hcScheme;
                if (targetMethod === "https") return "https";
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
        } else {
            const { initialValues } = props;

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
                    hcUnhealthyInterval:
                        initialValues.hcUnhealthyInterval ?? 30,
                    hcTimeout: initialValues.hcTimeout ?? 5,
                    hcHealthyThreshold:
                        initialValues.hcHealthyThreshold ?? 1,
                    hcUnhealthyThreshold:
                        initialValues.hcUnhealthyThreshold ?? 1,
                    hcFollowRedirects:
                        initialValues.hcFollowRedirects ?? true,
                    hcTlsServerName: initialValues.hcTlsServerName ?? "",
                    hcStatus: initialValues.hcStatus ?? null,
                    hcHeaders: parsedHeaders
                });
            } else {
                form.reset(DEFAULT_VALUES);
            }
        }
    }, [open]);

    const handleFieldChange = async (fieldName: string, value: any) => {
        if (mode !== "autoSave") return;
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

            await props.onChanges(configToSend);
        } catch (error) {
            toast({
                title: t("healthCheckError"),
                description: t("healthCheckErrorDescription"),
                variant: "destructive"
            });
        }
    };

    const onSubmit = async (values: FormValues) => {
        if (mode !== "submit") return;
        const { initialValues, onSaved } = props;

        setLoading(true);
        try {
            const payload = {
                name: (values as any).name,
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
                await api.put(`/org/${orgId}/health-check`, payload);
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

    const isEditing = mode === "submit" && !!(props as any).initialValues;

    const title =
        mode === "autoSave"
            ? t("configureHealthCheck")
            : isEditing
              ? t("standaloneHcEditTitle")
              : t("standaloneHcCreateTitle");

    const description =
        mode === "autoSave"
            ? t("configureHealthCheckDescription", {
                  target: (props as any).targetAddress
              })
            : t("standaloneHcDescription");

    return (
        <Credenza open={open} onOpenChange={setOpen}>
            <CredenzaContent className="max-w-2xl">
                <CredenzaHeader>
                    <CredenzaTitle>{title}</CredenzaTitle>
                    <CredenzaDescription>{description}</CredenzaDescription>
                </CredenzaHeader>
                <CredenzaBody>
                    <Form {...form}>
                        <form
                            id="hc-credenza-form"
                            onSubmit={
                                mode === "submit"
                                    ? form.handleSubmit(onSubmit)
                                    : undefined
                            }
                            className="space-y-6"
                        >
                            <HealthCheckFormFields
                                form={form}
                                showNameField={mode === "submit"}
                                hideEnabledField={mode === "submit"}
                                onFieldChange={
                                    mode === "autoSave"
                                        ? handleFieldChange
                                        : undefined
                                }
                            />
                        </form>
                    </Form>
                </CredenzaBody>
                <CredenzaFooter>
                    {mode === "autoSave" ? (
                        <Button onClick={() => setOpen(false)}>
                            {t("done")}
                        </Button>
                    ) : (
                        <>
                            <CredenzaClose asChild>
                                <Button variant="outline" type="button">
                                    {t("cancel")}
                                </Button>
                            </CredenzaClose>
                            <Button
                                type="submit"
                                form="hc-credenza-form"
                                disabled={loading}
                            >
                                {t("save")}
                            </Button>
                        </>
                    )}
                </CredenzaFooter>
            </CredenzaContent>
        </Credenza>
    );
}

export default HealthCheckCredenza;