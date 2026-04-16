"use client";

import { useEffect } from "react";
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
    orgId: string;
    targetAddress: string;
    targetMethod?: string;
    initialConfig?: Partial<HealthCheckConfig>;
    onChanges: (config: HealthCheckConfig) => Promise<void>;
};

export default function HealthCheckDialog({
    open,
    setOpen,
    orgId,
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
                            <HealthCheckFormFields
                                form={form}
                                onFieldChange={handleFieldChange}
                            />
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
