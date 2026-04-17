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
import { StrategySelect } from "@app/components/StrategySelect";
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
    watchedEnabled?: boolean;
    watchedMode?: string;
};

export function HealthCheckFormFields({
    form,
    onFieldChange,
    showNameField,
    hideEnabledField,
    watchedEnabled,
    watchedMode
}: HealthCheckFormFieldsProps) {
    const t = useTranslations();

    const showFields = hideEnabledField || watchedEnabled;

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
                            <div>
                                <FormLabel>{t("enableHealthChecks")}</FormLabel>
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
                    {/* Strategy */}
                    <FormField
                        control={form.control}
                        name="hcMode"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t("healthCheckStrategy")}</FormLabel>
                                <FormControl>
                                    <StrategySelect
                                        cols={2}
                                        options={[
                                                {
                                                    id: "http",
                                                    title: "HTTP",
                                                    description: "Validates connectivity and checks the HTTP response status."
                                                },
                                                {
                                                    id: "tcp",
                                                    title: "TCP",
                                                    description: "Verifies TCP connectivity only, without inspecting the response."
                                                }
                                        ]}
                                        value={field.value}
                                        onChange={(value) =>
                                            handleChange("hcMode", value, field.onChange)
                                        }
                                    />
                                </FormControl>
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
                                                type="number"
                                                min={1}
                                                max={65535}
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
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                                                type="number"
                                                min={1}
                                                max={65535}
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
                    )}

                    {/* HTTP Method + Timeout (shown when not TCP) */}
                    {watchedMode !== "tcp" && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                    )}

                    {/* TCP timeout (shown only for TCP) */}
                    {watchedMode === "tcp" && (
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
                    )}

                    {/* Healthy interval + healthy threshold */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>

                    {/* Unhealthy interval + unhealthy threshold */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>

                    {/* HTTP-only fields */}
                    {watchedMode !== "tcp" && (
                        <>
                            {/* Expected Response Codes + TLS Server Name + Follow Redirects */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
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
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            {/* Follow Redirects inline toggle */}
                            <FormField
                                control={form.control}
                                name="hcFollowRedirects"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                                        <FormLabel className="cursor-pointer">
                                            {t("followRedirects")}
                                        </FormLabel>
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
                        </>
                    )}
                </div>
            )}
        </>
    );
}
