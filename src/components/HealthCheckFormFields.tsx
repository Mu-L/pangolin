"use client";

import { UseFormReturn } from "react-hook-form";
import { useTranslations } from "next-intl";
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
import {
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@/components/ui/form";

type HealthCheckFormFieldsProps = {
    form: UseFormReturn<any>;
    onFieldChange?: (fieldName: string, value: any) => void;
    showNameField?: boolean;
    hideEnabledField?: boolean;
};

export function HealthCheckFormFields({
    form,
    onFieldChange,
    showNameField,
    hideEnabledField
}: HealthCheckFormFieldsProps) {
    const t = useTranslations();

    const watchedEnabled = form.watch("hcEnabled");
    const showFields = hideEnabledField || watchedEnabled;
    const watchedMode = form.watch("hcMode");

    const handleChange = (fieldName: string, value: any, fieldOnChange: (v: any) => void) => {
        fieldOnChange(value);
        if (onFieldChange) {
            onFieldChange(fieldName, value);
        }
    };

    return (
        <>
            {/* Name */}
            {showNameField && (
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t("standaloneHcNameLabel")}</FormLabel>
                            <FormControl>
                                <Input
                                    {...field}
                                    placeholder={t("standaloneHcNamePlaceholder")}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            )}

            {/* Enable Health Checks */}
            {!hideEnabledField && (
                <FormField
                    control={form.control}
                    name="hcEnabled"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                                <FormLabel>{t("enableHealthChecks")}</FormLabel>
                                <FormDescription>
                                    {t("enableHealthChecksDescription")}
                                </FormDescription>
                            </div>
                            <FormControl>
                                <Switch
                                    checked={field.value}
                                    onCheckedChange={(value) =>
                                        handleChange("hcEnabled", value, field.onChange)
                                    }
                                />
                            </FormControl>
                        </FormItem>
                    )}
                />
            )}

            {showFields && (
                <div className="space-y-4">
                    {/* Mode */}
                    <FormField
                        control={form.control}
                        name="hcMode"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t("healthCheckMode")}</FormLabel>
                                <Select
                                    onValueChange={(value) =>
                                        handleChange("hcMode", value, field.onChange)
                                    }
                                    value={field.value}
                                >
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="http">HTTP</SelectItem>
                                        <SelectItem value="tcp">TCP</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormDescription>
                                    {t("healthCheckModeDescription")}
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
                                        <FormLabel>{t("healthHostname")}</FormLabel>
                                        <FormControl>
                                            <Input
                                                {...field}
                                                onChange={(e) =>
                                                    handleChange(
                                                        "hcHostname",
                                                        e.target.value,
                                                        (v) => field.onChange(e)
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
                                name="hcPort"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t("healthPort")}</FormLabel>
                                        <FormControl>
                                            <Input
                                                {...field}
                                                onChange={(e) => {
                                                    const value = e.target.value;
                                                    handleChange("hcPort", value, field.onChange);
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
                                        <FormLabel>{t("healthScheme")}</FormLabel>
                                        <Select
                                            onValueChange={(value) =>
                                                handleChange("hcScheme", value, field.onChange)
                                            }
                                            value={field.value}
                                        >
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue
                                                        placeholder={t("healthSelectScheme")}
                                                    />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="http">HTTP</SelectItem>
                                                <SelectItem value="https">HTTPS</SelectItem>
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
                                        <FormLabel>{t("healthHostname")}</FormLabel>
                                        <FormControl>
                                            <Input
                                                {...field}
                                                onChange={(e) =>
                                                    handleChange(
                                                        "hcHostname",
                                                        e.target.value,
                                                        (v) => field.onChange(e)
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
                                name="hcPort"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t("healthPort")}</FormLabel>
                                        <FormControl>
                                            <Input
                                                {...field}
                                                onChange={(e) => {
                                                    const value = e.target.value;
                                                    handleChange("hcPort", value, field.onChange);
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
                                        <FormLabel>{t("healthCheckPath")}</FormLabel>
                                        <FormControl>
                                            <Input
                                                {...field}
                                                onChange={(e) =>
                                                    handleChange(
                                                        "hcPath",
                                                        e.target.value,
                                                        (v) => field.onChange(e)
                                                    )
                                                }
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
                                    <FormLabel>{t("httpMethod")}</FormLabel>
                                    <Select
                                        onValueChange={(value) =>
                                            handleChange("hcMethod", value, field.onChange)
                                        }
                                        value={field.value}
                                    >
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue
                                                    placeholder={t("selectHttpMethod")}
                                                />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="GET">GET</SelectItem>
                                            <SelectItem value="POST">POST</SelectItem>
                                            <SelectItem value="HEAD">HEAD</SelectItem>
                                            <SelectItem value="PUT">PUT</SelectItem>
                                            <SelectItem value="DELETE">DELETE</SelectItem>
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
                                    <FormLabel>{t("healthyIntervalSeconds")}</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="number"
                                            {...field}
                                            onChange={(e) => {
                                                const value = parseInt(e.target.value);
                                                handleChange("hcInterval", value, field.onChange);
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
                                    <FormLabel>{t("unhealthyIntervalSeconds")}</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="number"
                                            {...field}
                                            onChange={(e) => {
                                                const value = parseInt(e.target.value);
                                                handleChange(
                                                    "hcUnhealthyInterval",
                                                    value,
                                                    field.onChange
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
                                    <FormLabel>{t("timeoutSeconds")}</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="number"
                                            {...field}
                                            onChange={(e) => {
                                                const value = parseInt(e.target.value);
                                                handleChange("hcTimeout", value, field.onChange);
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
                                    <FormLabel>{t("healthyThreshold")}</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="number"
                                            {...field}
                                            onChange={(e) => {
                                                const value = parseInt(e.target.value);
                                                handleChange(
                                                    "hcHealthyThreshold",
                                                    value,
                                                    field.onChange
                                                );
                                            }}
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        {t("healthyThresholdDescription")}
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
                                    <FormLabel>{t("unhealthyThreshold")}</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="number"
                                            {...field}
                                            onChange={(e) => {
                                                const value = parseInt(e.target.value);
                                                handleChange(
                                                    "hcUnhealthyThreshold",
                                                    value,
                                                    field.onChange
                                                );
                                            }}
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        {t("unhealthyThresholdDescription")}
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
                                        <FormLabel>{t("expectedResponseCodes")}</FormLabel>
                                        <FormControl>
                                            <Input
                                                type="number"
                                                value={field.value ?? ""}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    const value = val ? parseInt(val) : null;
                                                    handleChange("hcStatus", value, field.onChange);
                                                }}
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            {t("expectedResponseCodesDescription")}
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
                                        <FormLabel>{t("tlsServerName")}</FormLabel>
                                        <FormControl>
                                            <Input
                                                {...field}
                                                onChange={(e) =>
                                                    handleChange(
                                                        "hcTlsServerName",
                                                        e.target.value,
                                                        (v) => field.onChange(e)
                                                    )
                                                }
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            {t("tlsServerNameDescription")}
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
                                        <FormLabel>{t("customHeaders")}</FormLabel>
                                        <FormControl>
                                            <HeadersInput
                                                value={field.value}
                                                onChange={(value) =>
                                                    handleChange(
                                                        "hcHeaders",
                                                        value,
                                                        field.onChange
                                                    )
                                                }
                                                rows={4}
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            {t("customHeadersDescription")}
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
                                            <FormLabel>{t("followRedirects")}</FormLabel>
                                            <FormDescription>
                                                {t("followRedirectsDescription")}
                                            </FormDescription>
                                        </div>
                                        <FormControl>
                                            <Switch
                                                checked={field.value}
                                                onCheckedChange={(value) =>
                                                    handleChange(
                                                        "hcFollowRedirects",
                                                        value,
                                                        field.onChange
                                                    )
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
        </>
    );
}
