"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@app/hooks/useToast";
import { useCallback, useEffect, useState } from "react";
import { formatAxiosError } from "@app/lib/api";
import { createApiClient } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useUserContext } from "@app/hooks/useUserContext";
import { build } from "@server/build";
import { Separator } from "@/components/ui/separator";
import { z } from "zod";
import { useRouter, useSearchParams } from "next/navigation";
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
} from "@app/components/ui/form";
import { Alert, AlertDescription } from "@app/components/ui/alert";
import { useTranslations } from "next-intl";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger
} from "@app/components/ui/collapsible";
import { ArrowRight, ChevronsUpDown } from "lucide-react";
import { cn } from "@app/lib/cn";

type Step = "org" | "site" | "resources";

export default function StepperForm() {
    const [currentStep, setCurrentStep] = useState<Step>("org");
    const [orgIdTaken, setOrgIdTaken] = useState(false);
    const t = useTranslations();
    const { env } = useEnvContext();
    const { user } = useUserContext();

    const [loading, setLoading] = useState(false);
    const [isChecked, setIsChecked] = useState(false);
    // Removed error state, now using toast for API errors
    const [orgCreated, setOrgCreated] = useState(false);
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

    const orgSchema = z.object({
        orgName: z.string().min(1, { message: t("orgNameRequired") }),
        orgId: z
            .string()
            .min(1, { message: t("orgIdRequired") })
            .max(32, { message: t("orgIdMaxLength") }),
        subnet: z.string().min(1, { message: t("subnetRequired") }),
        utilitySubnet: z.string().min(1, { message: t("subnetRequired") })
    });

    const orgForm = useForm({
        resolver: zodResolver(orgSchema),
        defaultValues: {
            orgName: "",
            orgId: "",
            subnet: "",
            utilitySubnet: ""
        }
    });

    const api = createApiClient(useEnvContext());
    const router = useRouter();
    const searchParams = useSearchParams();
    const isFirstOrg = searchParams.get("firstOrg") != null;

    // Fetch default subnet on component mount
    useEffect(() => {
        fetchDefaultSubnet();
    }, []);

    // Prefill org name and id when build is saas and firstOrg query param is set
    useEffect(() => {
        if (build !== "saas" || !user || !isFirstOrg) return;

        const orgName = user.email
            ? `${user.email}'s Organization`
            : "My Organization";
        const orgId = `org_${user.userId}`;
        orgForm.setValue("orgName", orgName);
        orgForm.setValue("orgId", orgId);
        debouncedCheckOrgIdAvailability(orgId);
    }, []);

    const fetchDefaultSubnet = async () => {
        try {
            const res = await api.get(`/pick-org-defaults`);
            if (res && res.data && res.data.data) {
                orgForm.setValue("subnet", res.data.data.subnet);
                orgForm.setValue("utilitySubnet", res.data.data.utilitySubnet);
            }
        } catch (e) {
            console.error("Failed to fetch default subnet:", e);
            toast({
                title: t("error"),
                description: t("setupFailedToFetchSubnet"),
                variant: "destructive"
            });
        }
    };

    const checkOrgIdAvailability = useCallback(
        async (value: string) => {
            if (loading || orgCreated) {
                return;
            }
            try {
                const res = await api.get(`/org/checkId`, {
                    params: {
                        orgId: value
                    }
                });
                setOrgIdTaken(res.status !== 404);
            } catch (error) {
                setOrgIdTaken(false);
            }
        },
        [loading, orgCreated, api]
    );

    const debouncedCheckOrgIdAvailability = useCallback(
        debounce(checkOrgIdAvailability, 300),
        [checkOrgIdAvailability]
    );

    const generateId = (name: string) => {
        // Replace any character that is not a letter, number, space, or hyphen with a hyphen
        // Also collapse multiple hyphens and trim
        return name
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, "-")
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-+|-+$/g, "");
    };

    const sanitizeOrgId = (value: string) => {
        return value
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9_-]/g, "")
            .replace(/-+/g, "-")
            .slice(0, 32);
    };

    async function orgSubmit(values: z.infer<typeof orgSchema>) {
        if (orgIdTaken) {
            return;
        }

        setLoading(true);

        try {
            const res = await api.put(`/org`, {
                orgId: values.orgId,
                name: values.orgName,
                subnet: values.subnet,
                utilitySubnet: values.utilitySubnet
            });

            if (res && res.status === 201) {
                setOrgCreated(true);
                router.push(`/${values.orgId}/settings/sites/create`);
            }
        } catch (e) {
            console.error(e);
            toast({
                title: t("error"),
                description: formatAxiosError(e, t("orgErrorCreate")),
                variant: "destructive"
            });
        }

        setLoading(false);
    }

    return (
        <section className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                    {t("setupNewOrg")}
                </h1>
                <p className="text-muted-foreground text-sm mt-1">
                    {t("setupCreate")}
                </p>
            </div>
            <div className="flex justify-between mb-2">
                <div className="flex flex-col items-center">
                    <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center mb-2 ${
                            currentStep === "org"
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground"
                        }`}
                    >
                        1
                    </div>
                    <span
                        className={`text-sm font-medium ${
                            currentStep === "org"
                                ? "text-primary"
                                : "text-muted-foreground"
                        }`}
                    >
                        {t("setupCreateOrg")}
                    </span>
                </div>
                <div className="flex flex-col items-center">
                    <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center mb-2 ${
                            currentStep === "site"
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground"
                        }`}
                    >
                        2
                    </div>
                    <span
                        className={`text-sm font-medium ${
                            currentStep === "site"
                                ? "text-primary"
                                : "text-muted-foreground"
                        }`}
                    >
                        {t("siteCreate")}
                    </span>
                </div>
                <div className="flex flex-col items-center">
                    <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center mb-2 ${
                            currentStep === "resources"
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground"
                        }`}
                    >
                        3
                    </div>
                    <span
                        className={`text-sm font-medium ${
                            currentStep === "resources"
                                ? "text-primary"
                                : "text-muted-foreground"
                        }`}
                    >
                        {t("setupCreateResources")}
                    </span>
                </div>
            </div>

            <Separator />

            {currentStep === "org" && (
                <Form {...orgForm}>
                    <form
                        onSubmit={orgForm.handleSubmit(orgSubmit)}
                        className="space-y-4"
                    >
                        <FormField
                            control={orgForm.control}
                            name="orgName"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t("setupOrgName")}</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="text"
                                            {...field}
                                            onChange={(e) => {
                                                // Prevent "/" in orgName input
                                                const sanitizedValue =
                                                    e.target.value.replace(
                                                        /\//g,
                                                        "-"
                                                    );
                                                const orgId =
                                                    generateId(sanitizedValue);
                                                orgForm.setValue(
                                                    "orgId",
                                                    orgId
                                                );
                                                orgForm.setValue(
                                                    "orgName",
                                                    sanitizedValue
                                                );
                                                debouncedCheckOrgIdAvailability(
                                                    orgId
                                                );
                                            }}
                                            value={field.value.replace(
                                                /\//g,
                                                "-"
                                            )}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                    <FormDescription>
                                        {t("orgDisplayName")}
                                    </FormDescription>
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={orgForm.control}
                            name="orgId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t("orgId")}</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="text"
                                            {...field}
                                            onChange={(e) => {
                                                const value = sanitizeOrgId(
                                                    e.target.value
                                                );
                                                field.onChange(value);
                                                setOrgIdTaken(false);
                                                if (value) {
                                                    debouncedCheckOrgIdAvailability(
                                                        value
                                                    );
                                                }
                                            }}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                    <FormDescription>
                                        {t("setupIdentifierMessage")}
                                    </FormDescription>
                                </FormItem>
                            )}
                        />

                        <Collapsible
                            open={isAdvancedOpen}
                            onOpenChange={setIsAdvancedOpen}
                            className="space-y-2"
                        >
                            <div className="flex items-center justify-between space-x-4">
                                <CollapsibleTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="text"
                                        size="sm"
                                        className="p-0 flex items-center justify-between w-full"
                                    >
                                        <h4 className="text-sm">
                                            {t("advancedSettings")}
                                        </h4>
                                        <div>
                                            <ChevronsUpDown className="h-4 w-4" />
                                            <span className="sr-only">
                                                {t("toggle")}
                                            </span>
                                        </div>
                                    </Button>
                                </CollapsibleTrigger>
                            </div>
                            <CollapsibleContent className="space-y-4">
                                <FormField
                                    control={orgForm.control}
                                    name="subnet"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                {t("setupSubnetAdvanced")}
                                            </FormLabel>
                                            <FormControl>
                                                <Input type="text" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                            <FormDescription>
                                                {t("setupSubnetDescription")}
                                            </FormDescription>
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={orgForm.control}
                                    name="utilitySubnet"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                {t("setupUtilitySubnet")}
                                            </FormLabel>
                                            <FormControl>
                                                <Input type="text" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                            <FormDescription>
                                                {t(
                                                    "setupUtilitySubnetDescription"
                                                )}
                                            </FormDescription>
                                        </FormItem>
                                    )}
                                />
                            </CollapsibleContent>
                        </Collapsible>

                        {orgIdTaken && !orgCreated ? (
                            <Alert variant="destructive">
                                <AlertDescription>
                                    {t("setupErrorIdentifier")}
                                </AlertDescription>
                            </Alert>
                        ) : null}

                        {/* Error Alert removed, errors now shown as toast */}

                        <div className="flex justify-end">
                            <Button
                                type="submit"
                                loading={loading}
                                disabled={loading || orgIdTaken}
                            >
                                {t("setupCreateOrg")}
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </div>
                    </form>
                </Form>
            )}
        </section>
    );
}

function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null;

    return (...args: Parameters<T>) => {
        if (timeout) clearTimeout(timeout);

        timeout = setTimeout(() => {
            func(...args);
        }, wait);
    };
}
