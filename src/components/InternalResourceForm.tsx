"use client";

import { Tag, TagInput } from "@app/components/tags/tag-input";
import { Button } from "@app/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList
} from "@app/components/ui/command";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@app/components/ui/form";
import { Input } from "@app/components/ui/input";
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@app/components/ui/popover";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@app/components/ui/select";
import { Switch } from "@app/components/ui/switch";
import { getUserDisplayName } from "@app/lib/getUserDisplayName";
import { cn } from "@app/lib/cn";
import { orgQueries, resourceQueries } from "@app/lib/queries";
import { useQueries, useQuery } from "@tanstack/react-query";
import { ListSitesResponse } from "@server/routers/site";
import { UserType } from "@server/types/UserTypes";
import { Check, ChevronsUpDown, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { usePaidStatus } from "@app/hooks/usePaidStatus";
import { tierMatrix } from "@server/lib/billing/tierMatrix";
import { HorizontalTabs } from "@app/components/HorizontalTabs";
import { PaidFeaturesAlert } from "@app/components/PaidFeaturesAlert";
import { StrategySelect } from "@app/components/StrategySelect";

// --- Helpers (shared) ---

const isValidPortRangeString = (val: string | undefined | null): boolean => {
    if (!val || val.trim() === "" || val.trim() === "*") return true;
    const parts = val.split(",").map((p) => p.trim());
    for (const part of parts) {
        if (part === "") return false;
        if (part.includes("-")) {
            const [start, end] = part.split("-").map((p) => p.trim());
            if (!start || !end) return false;
            const startPort = parseInt(start, 10);
            const endPort = parseInt(end, 10);
            if (isNaN(startPort) || isNaN(endPort)) return false;
            if (
                startPort < 1 ||
                startPort > 65535 ||
                endPort < 1 ||
                endPort > 65535
            )
                return false;
            if (startPort > endPort) return false;
        } else {
            const port = parseInt(part, 10);
            if (isNaN(port) || port < 1 || port > 65535) return false;
        }
    }
    return true;
};

const getPortRangeValidationMessage = (t: (key: string) => string) =>
    t("editInternalResourceDialogPortRangeValidationError");

const createPortRangeStringSchema = (t: (key: string) => string) =>
    z
        .string()
        .optional()
        .nullable()
        .refine((val) => isValidPortRangeString(val), {
            message: getPortRangeValidationMessage(t)
        });

export type PortMode = "all" | "blocked" | "custom";
export const getPortModeFromString = (
    val: string | undefined | null
): PortMode => {
    if (val === "*") return "all";
    if (!val || val.trim() === "") return "blocked";
    return "custom";
};

export const getPortStringFromMode = (
    mode: PortMode,
    customValue: string
): string | undefined => {
    if (mode === "all") return "*";
    if (mode === "blocked") return "";
    return customValue;
};

export const isHostname = (destination: string): boolean =>
    /[a-zA-Z]/.test(destination);

export const cleanForFQDN = (name: string): string =>
    name
        .toLowerCase()
        .replace(/[^a-z0-9.-]/g, "-")
        .replace(/[-]+/g, "-")
        .replace(/^-|-$/g, "")
        .replace(/^\.|\.$/g, "");

// --- Types ---

type Site = ListSitesResponse["sites"][0];

export type InternalResourceData = {
    id: number;
    name: string;
    orgId: string;
    siteName: string;
    mode: "host" | "cidr";
    siteId: number;
    destination: string;
    alias?: string | null;
    tcpPortRangeString?: string | null;
    udpPortRangeString?: string | null;
    disableIcmp?: boolean;
    authDaemonMode?: "site" | "remote" | null;
    authDaemonPort?: number | null;
};

const tagSchema = z.object({ id: z.string(), text: z.string() });

export type InternalResourceFormValues = {
    name: string;
    siteId: number;
    mode: "host" | "cidr";
    destination: string;
    alias?: string | null;
    tcpPortRangeString?: string | null;
    udpPortRangeString?: string | null;
    disableIcmp?: boolean;
    authDaemonMode?: "site" | "remote" | null;
    authDaemonPort?: number | null;
    roles?: z.infer<typeof tagSchema>[];
    users?: z.infer<typeof tagSchema>[];
    clients?: z.infer<typeof tagSchema>[];
};

type InternalResourceFormProps = {
    variant: "create" | "edit";
    resource?: InternalResourceData;
    open?: boolean;
    sites: Site[];
    orgId: string;
    siteResourceId?: number;
    formId: string;
    onSubmit: (values: InternalResourceFormValues) => void | Promise<void>;
};

export function InternalResourceForm({
    variant,
    resource,
    open,
    sites,
    orgId,
    siteResourceId,
    formId,
    onSubmit
}: InternalResourceFormProps) {
    const t = useTranslations();
    const { env } = useEnvContext();
    const { isPaidUser } = usePaidStatus();
    const disableEnterpriseFeatures = env.flags.disableEnterpriseFeatures;
    const sshSectionDisabled = !isPaidUser(tierMatrix.sshPam);

    const nameRequiredKey =
        variant === "create"
            ? "createInternalResourceDialogNameRequired"
            : "editInternalResourceDialogNameRequired";
    const nameMaxKey =
        variant === "create"
            ? "createInternalResourceDialogNameMaxLength"
            : "editInternalResourceDialogNameMaxLength";
    const siteRequiredKey =
        variant === "create"
            ? "createInternalResourceDialogPleaseSelectSite"
            : undefined;
    const nameLabelKey =
        variant === "create"
            ? "createInternalResourceDialogName"
            : "editInternalResourceDialogName";
    const modeLabelKey =
        variant === "create"
            ? "createInternalResourceDialogMode"
            : "editInternalResourceDialogMode";
    const modeHostKey =
        variant === "create"
            ? "createInternalResourceDialogModeHost"
            : "editInternalResourceDialogModeHost";
    const modeCidrKey =
        variant === "create"
            ? "createInternalResourceDialogModeCidr"
            : "editInternalResourceDialogModeCidr";
    const destinationLabelKey =
        variant === "create"
            ? "createInternalResourceDialogDestination"
            : "editInternalResourceDialogDestination";
    const destinationRequiredKey =
        variant === "create"
            ? "createInternalResourceDialogDestinationRequired"
            : undefined;
    const aliasLabelKey =
        variant === "create"
            ? "createInternalResourceDialogAlias"
            : "editInternalResourceDialogAlias";

    const formSchema = z.object({
        name: z.string().min(1, t(nameRequiredKey)).max(255, t(nameMaxKey)),
        siteId: z
            .number()
            .int()
            .positive(siteRequiredKey ? t(siteRequiredKey) : undefined),
        mode: z.enum(["host", "cidr"]),
        destination: z
            .string()
            .min(
                1,
                destinationRequiredKey
                    ? { message: t(destinationRequiredKey) }
                    : undefined
            ),
        alias: z.string().nullish(),
        tcpPortRangeString: createPortRangeStringSchema(t),
        udpPortRangeString: createPortRangeStringSchema(t),
        disableIcmp: z.boolean().optional(),
        authDaemonMode: z.enum(["site", "remote"]).optional().nullable(),
        authDaemonPort: z.number().int().positive().optional().nullable(),
        roles: z.array(tagSchema).optional(),
        users: z.array(tagSchema).optional(),
        clients: z.array(tagSchema).optional()
    });

    type FormData = z.infer<typeof formSchema>;

    const availableSites = sites.filter((s) => s.type === "newt");

    const rolesQuery = useQuery(orgQueries.roles({ orgId }));
    const usersQuery = useQuery(orgQueries.users({ orgId }));
    const clientsQuery = useQuery(orgQueries.clients({ orgId }));
    const resourceRolesQuery = useQuery({
        ...resourceQueries.siteResourceRoles({
            siteResourceId: siteResourceId ?? 0
        }),
        enabled: siteResourceId != null
    });
    const resourceUsersQuery = useQuery({
        ...resourceQueries.siteResourceUsers({
            siteResourceId: siteResourceId ?? 0
        }),
        enabled: siteResourceId != null
    });
    const resourceClientsQuery = useQuery({
        ...resourceQueries.siteResourceClients({
            siteResourceId: siteResourceId ?? 0
        }),
        enabled: siteResourceId != null
    });

    const allRoles = (rolesQuery.data ?? [])
        .map((r) => ({ id: r.roleId.toString(), text: r.name }))
        .filter((r) => r.text !== "Admin");
    const allUsers = (usersQuery.data ?? []).map((u) => ({
        id: u.id.toString(),
        text: `${getUserDisplayName({ email: u.email, username: u.username })}${u.type !== UserType.Internal ? ` (${u.idpName})` : ""}`
    }));
    const allClients = (clientsQuery.data ?? [])
        .filter((c) => !c.userId)
        .map((c) => ({ id: c.clientId.toString(), text: c.name }));

    let formRoles: FormData["roles"] = [];
    let formUsers: FormData["users"] = [];
    let existingClients: FormData["clients"] = [];
    if (siteResourceId != null) {
        const rolesData = resourceRolesQuery.data;
        const usersData = resourceUsersQuery.data;
        const clientsData = resourceClientsQuery.data;
        if (rolesData) {
            formRoles = (rolesData as { roleId: number; name: string }[])
                .map((i) => ({ id: i.roleId.toString(), text: i.name }))
                .filter((r) => r.text !== "Admin");
        }
        if (usersData) {
            formUsers = (
                usersData as {
                    userId: string;
                    email?: string;
                    username?: string;
                    type?: string;
                    idpName?: string;
                }[]
            ).map((i) => ({
                id: i.userId.toString(),
                text: `${getUserDisplayName({ email: i.email, username: i.username })}${i.type !== UserType.Internal ? ` (${i.idpName})` : ""}`
            }));
        }
        if (clientsData) {
            existingClients = (
                clientsData as { clientId: number; name: string }[]
            ).map((c) => ({
                id: c.clientId.toString(),
                text: c.name
            }));
        }
    }

    const loadingRolesUsers =
        rolesQuery.isLoading ||
        usersQuery.isLoading ||
        clientsQuery.isLoading ||
        (siteResourceId != null &&
            (resourceRolesQuery.isLoading ||
                resourceUsersQuery.isLoading ||
                resourceClientsQuery.isLoading));

    const hasMachineClients = allClients.length > 0;

    const [activeRolesTagIndex, setActiveRolesTagIndex] = useState<
        number | null
    >(null);
    const [activeUsersTagIndex, setActiveUsersTagIndex] = useState<
        number | null
    >(null);
    const [activeClientsTagIndex, setActiveClientsTagIndex] = useState<
        number | null
    >(null);

    const [tcpPortMode, setTcpPortMode] = useState<PortMode>(() =>
        variant === "edit" && resource
            ? getPortModeFromString(resource.tcpPortRangeString)
            : "all"
    );
    const [udpPortMode, setUdpPortMode] = useState<PortMode>(() =>
        variant === "edit" && resource
            ? getPortModeFromString(resource.udpPortRangeString)
            : "all"
    );
    const [tcpCustomPorts, setTcpCustomPorts] = useState<string>(() =>
        variant === "edit" &&
        resource &&
        resource.tcpPortRangeString &&
        resource.tcpPortRangeString !== "*"
            ? resource.tcpPortRangeString
            : ""
    );
    const [udpCustomPorts, setUdpCustomPorts] = useState<string>(() =>
        variant === "edit" &&
        resource &&
        resource.udpPortRangeString &&
        resource.udpPortRangeString !== "*"
            ? resource.udpPortRangeString
            : ""
    );

    const defaultValues: FormData =
        variant === "edit" && resource
            ? {
                  name: resource.name,
                  siteId: resource.siteId,
                  mode: resource.mode ?? "host",
                  destination: resource.destination ?? "",
                  alias: resource.alias ?? null,
                  tcpPortRangeString: resource.tcpPortRangeString ?? "*",
                  udpPortRangeString: resource.udpPortRangeString ?? "*",
                  disableIcmp: resource.disableIcmp ?? false,
                  authDaemonMode: resource.authDaemonMode ?? null,
                  authDaemonPort: resource.authDaemonPort ?? null,
                  roles: [],
                  users: [],
                  clients: []
              }
            : {
                  name: "",
                  siteId: availableSites[0]?.siteId ?? 0,
                  mode: "host",
                  destination: "",
                  alias: null,
                  tcpPortRangeString: "*",
                  udpPortRangeString: "*",
                  disableIcmp: false,
                  authDaemonMode: "site",
                  authDaemonPort: null,
                  roles: [],
                  users: [],
                  clients: []
              };

    const form = useForm<FormData>({
        resolver: zodResolver(formSchema),
        defaultValues
    });

    const mode = form.watch("mode");
    const authDaemonMode = form.watch("authDaemonMode");
    const hasInitialized = useRef(false);
    const previousResourceId = useRef<number | null>(null);

    useEffect(() => {
        const tcpValue = getPortStringFromMode(tcpPortMode, tcpCustomPorts);
        form.setValue("tcpPortRangeString", tcpValue);
    }, [tcpPortMode, tcpCustomPorts, form]);

    useEffect(() => {
        const udpValue = getPortStringFromMode(udpPortMode, udpCustomPorts);
        form.setValue("udpPortRangeString", udpValue);
    }, [udpPortMode, udpCustomPorts, form]);

    // Reset when create dialog opens
    useEffect(() => {
        if (variant === "create" && open) {
            form.reset({
                name: "",
                siteId: availableSites[0]?.siteId ?? 0,
                mode: "host",
                destination: "",
                alias: null,
                tcpPortRangeString: "*",
                udpPortRangeString: "*",
                disableIcmp: false,
                authDaemonMode: "site",
                authDaemonPort: null,
                roles: [],
                users: [],
                clients: []
            });
            setTcpPortMode("all");
            setUdpPortMode("all");
            setTcpCustomPorts("");
            setUdpCustomPorts("");
        }
    }, [variant, open]);

    // Reset when edit dialog opens / resource changes
    useEffect(() => {
        if (variant === "edit" && resource) {
            const resourceChanged = previousResourceId.current !== resource.id;
            if (resourceChanged) {
                form.reset({
                    name: resource.name,
                    siteId: resource.siteId,
                    mode: resource.mode ?? "host",
                    destination: resource.destination ?? "",
                    alias: resource.alias ?? null,
                    tcpPortRangeString: resource.tcpPortRangeString ?? "*",
                    udpPortRangeString: resource.udpPortRangeString ?? "*",
                    disableIcmp: resource.disableIcmp ?? false,
                    authDaemonMode: resource.authDaemonMode ?? null,
                    authDaemonPort: resource.authDaemonPort ?? null,
                    roles: [],
                    users: [],
                    clients: []
                });
                setTcpPortMode(
                    getPortModeFromString(resource.tcpPortRangeString)
                );
                setUdpPortMode(
                    getPortModeFromString(resource.udpPortRangeString)
                );
                setTcpCustomPorts(
                    resource.tcpPortRangeString &&
                        resource.tcpPortRangeString !== "*"
                        ? resource.tcpPortRangeString
                        : ""
                );
                setUdpCustomPorts(
                    resource.udpPortRangeString &&
                        resource.udpPortRangeString !== "*"
                        ? resource.udpPortRangeString
                        : ""
                );
                previousResourceId.current = resource.id;
            }
        }
    }, [variant, resource, form]);

    // When edit dialog closes, clear previousResourceId so next open (for any resource) resets from fresh data
    useEffect(() => {
        if (variant === "edit" && open === false) {
            previousResourceId.current = null;
        }
    }, [variant, open]);

    // Populate roles/users/clients when edit data is loaded
    useEffect(() => {
        if (
            variant === "edit" &&
            siteResourceId != null &&
            !loadingRolesUsers &&
            !hasInitialized.current
        ) {
            hasInitialized.current = true;
            form.setValue("roles", formRoles);
            form.setValue("users", formUsers);
            form.setValue("clients", existingClients);
        }
    }, [
        variant,
        siteResourceId,
        loadingRolesUsers,
        formRoles,
        formUsers,
        existingClients,
        form
    ]);

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit((values) =>
                    onSubmit(values as InternalResourceFormValues)
                )}
                className="space-y-6"
                id={formId}
            >
                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t(nameLabelKey)}</FormLabel>
                                <FormControl>
                                    <Input {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="siteId"
                        render={({ field }) => (
                            <FormItem className="flex flex-col">
                                <FormLabel>{t("site")}</FormLabel>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <FormControl>
                                            <Button
                                                variant="outline"
                                                role="combobox"
                                                className={cn(
                                                    "w-full justify-between",
                                                    !field.value &&
                                                        "text-muted-foreground"
                                                )}
                                            >
                                                {field.value
                                                    ? availableSites.find(
                                                          (s) =>
                                                              s.siteId ===
                                                              field.value
                                                      )?.name
                                                    : t("selectSite")}
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-full p-0">
                                        <Command>
                                            <CommandInput
                                                placeholder={t("searchSites")}
                                            />
                                            <CommandList>
                                                <CommandEmpty>
                                                    {t("noSitesFound")}
                                                </CommandEmpty>
                                                <CommandGroup>
                                                    {availableSites.map(
                                                        (site) => (
                                                            <CommandItem
                                                                key={
                                                                    site.siteId
                                                                }
                                                                value={
                                                                    site.name
                                                                }
                                                                onSelect={() =>
                                                                    field.onChange(
                                                                        site.siteId
                                                                    )
                                                                }
                                                            >
                                                                <Check
                                                                    className={cn(
                                                                        "mr-2 h-4 w-4",
                                                                        field.value ===
                                                                            site.siteId
                                                                            ? "opacity-100"
                                                                            : "opacity-0"
                                                                    )}
                                                                />
                                                                {site.name}
                                                            </CommandItem>
                                                        )
                                                    )}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <HorizontalTabs
                    clientSide={true}
                    defaultTab={0}
                    items={[
                        {
                            title: t(
                                "editInternalResourceDialogNetworkSettings"
                            ),
                            href: "#"
                        },
                        {
                            title: t("editInternalResourceDialogAccessPolicy"),
                            href: "#"
                        },
                        ...(disableEnterpriseFeatures
                            ? []
                            : [{ title: t("sshAccess"), href: "#" }])
                    ]}
                >
                    <div className="space-y-4 mt-4">
                        <div>
                            <div className="mb-8">
                                <label className="font-medium block">
                                    {t(
                                        "editInternalResourceDialogDestinationLabel"
                                    )}
                                </label>
                                <div className="text-sm text-muted-foreground">
                                    {t(
                                        "editInternalResourceDialogDestinationDescription"
                                    )}
                                </div>
                            </div>
                            <div
                                className={cn(
                                    "grid gap-4 items-start",
                                    mode === "cidr"
                                        ? "grid-cols-4"
                                        : "grid-cols-12"
                                )}
                            >
                                <div
                                    className={
                                        mode === "cidr"
                                            ? "col-span-1"
                                            : "col-span-3"
                                    }
                                >
                                    <FormField
                                        control={form.control}
                                        name="mode"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>
                                                    {t(modeLabelKey)}
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
                                                        <SelectItem value="host">
                                                            {t(modeHostKey)}
                                                        </SelectItem>
                                                        <SelectItem value="cidr">
                                                            {t(modeCidrKey)}
                                                        </SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                <div
                                    className={
                                        mode === "cidr"
                                            ? "col-span-3"
                                            : "col-span-5"
                                    }
                                >
                                    <FormField
                                        control={form.control}
                                        name="destination"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>
                                                    {t(destinationLabelKey)}
                                                </FormLabel>
                                                <FormControl>
                                                    <Input {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                {mode !== "cidr" && (
                                    <div className="col-span-4">
                                        <FormField
                                            control={form.control}
                                            name="alias"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>
                                                        {t(aliasLabelKey)}
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            {...field}
                                                            value={
                                                                field.value ??
                                                                ""
                                                            }
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="my-8">
                                <label className="font-medium block">
                                    {t("portRestrictions")}
                                </label>
                                <div className="text-sm text-muted-foreground">
                                    {t(
                                        "editInternalResourceDialogPortRestrictionsDescription"
                                    )}
                                </div>
                            </div>
                            <div
                                className={cn(
                                    "grid gap-4 items-start",
                                    mode === "cidr"
                                        ? "grid-cols-4"
                                        : "grid-cols-12"
                                )}
                            >
                                <div
                                    className={
                                        mode === "cidr"
                                            ? "col-span-1"
                                            : "col-span-3"
                                    }
                                >
                                    <FormLabel className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                        {t("editInternalResourceDialogTcp")}
                                    </FormLabel>
                                </div>
                                <div
                                    className={
                                        mode === "cidr"
                                            ? "col-span-3"
                                            : "col-span-9"
                                    }
                                >
                                    <FormField
                                        control={form.control}
                                        name="tcpPortRangeString"
                                        render={() => (
                                            <FormItem>
                                                <div className="flex items-center gap-2">
                                                    <Select
                                                        value={tcpPortMode}
                                                        onValueChange={(
                                                            v: PortMode
                                                        ) => setTcpPortMode(v)}
                                                    >
                                                        <FormControl>
                                                            <SelectTrigger className="w-[110px]">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            <SelectItem value="all">
                                                                {t("allPorts")}
                                                            </SelectItem>
                                                            <SelectItem value="blocked">
                                                                {t("blocked")}
                                                            </SelectItem>
                                                            <SelectItem value="custom">
                                                                {t("custom")}
                                                            </SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    {tcpPortMode ===
                                                    "custom" ? (
                                                        <FormControl>
                                                            <Input
                                                                placeholder="80,443,8000-9000"
                                                                value={
                                                                    tcpCustomPorts
                                                                }
                                                                onChange={(e) =>
                                                                    setTcpCustomPorts(
                                                                        e.target
                                                                            .value
                                                                    )
                                                                }
                                                            />
                                                        </FormControl>
                                                    ) : (
                                                        <Input
                                                            disabled
                                                            placeholder={
                                                                tcpPortMode ===
                                                                "all"
                                                                    ? t(
                                                                          "allPortsAllowed"
                                                                      )
                                                                    : t(
                                                                          "allPortsBlocked"
                                                                      )
                                                            }
                                                        />
                                                    )}
                                                </div>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </div>
                            <div
                                className={cn(
                                    "grid gap-4 items-start",
                                    mode === "cidr"
                                        ? "grid-cols-4"
                                        : "grid-cols-12"
                                )}
                            >
                                <div
                                    className={
                                        mode === "cidr"
                                            ? "col-span-1"
                                            : "col-span-3"
                                    }
                                >
                                    <FormLabel className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                        {t("editInternalResourceDialogUdp")}
                                    </FormLabel>
                                </div>
                                <div
                                    className={
                                        mode === "cidr"
                                            ? "col-span-3"
                                            : "col-span-9"
                                    }
                                >
                                    <FormField
                                        control={form.control}
                                        name="udpPortRangeString"
                                        render={() => (
                                            <FormItem>
                                                <div className="flex items-center gap-2">
                                                    <Select
                                                        value={udpPortMode}
                                                        onValueChange={(
                                                            v: PortMode
                                                        ) => setUdpPortMode(v)}
                                                    >
                                                        <FormControl>
                                                            <SelectTrigger className="w-[110px]">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            <SelectItem value="all">
                                                                {t("allPorts")}
                                                            </SelectItem>
                                                            <SelectItem value="blocked">
                                                                {t("blocked")}
                                                            </SelectItem>
                                                            <SelectItem value="custom">
                                                                {t("custom")}
                                                            </SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    {udpPortMode ===
                                                    "custom" ? (
                                                        <FormControl>
                                                            <Input
                                                                placeholder="53,123,500-600"
                                                                value={
                                                                    udpCustomPorts
                                                                }
                                                                onChange={(e) =>
                                                                    setUdpCustomPorts(
                                                                        e.target
                                                                            .value
                                                                    )
                                                                }
                                                            />
                                                        </FormControl>
                                                    ) : (
                                                        <Input
                                                            disabled
                                                            placeholder={
                                                                udpPortMode ===
                                                                "all"
                                                                    ? t(
                                                                          "allPortsAllowed"
                                                                      )
                                                                    : t(
                                                                          "allPortsBlocked"
                                                                      )
                                                            }
                                                        />
                                                    )}
                                                </div>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </div>
                            <div
                                className={cn(
                                    "grid gap-4 items-start",
                                    mode === "cidr"
                                        ? "grid-cols-4"
                                        : "grid-cols-12"
                                )}
                            >
                                <div
                                    className={
                                        mode === "cidr"
                                            ? "col-span-1"
                                            : "col-span-3"
                                    }
                                >
                                    <FormLabel className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                        {t("editInternalResourceDialogIcmp")}
                                    </FormLabel>
                                </div>
                                <div
                                    className={
                                        mode === "cidr"
                                            ? "col-span-3"
                                            : "col-span-9"
                                    }
                                >
                                    <FormField
                                        control={form.control}
                                        name="disableIcmp"
                                        render={({ field }) => (
                                            <FormItem>
                                                <div className="flex items-center gap-2">
                                                    <FormControl>
                                                        <Switch
                                                            checked={
                                                                !field.value
                                                            }
                                                            onCheckedChange={(
                                                                checked
                                                            ) =>
                                                                field.onChange(
                                                                    !checked
                                                                )
                                                            }
                                                        />
                                                    </FormControl>
                                                    <span className="text-sm text-muted-foreground">
                                                        {field.value
                                                            ? t("blocked")
                                                            : t("allowed")}
                                                    </span>
                                                </div>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4 mt-4">
                        <div className="mb-8">
                            <label className="font-medium block">
                                {t("editInternalResourceDialogAccessControl")}
                            </label>
                            <div className="text-sm text-muted-foreground">
                                {t(
                                    "editInternalResourceDialogAccessControlDescription"
                                )}
                            </div>
                        </div>
                        {loadingRolesUsers ? (
                            <div className="text-sm text-muted-foreground">
                                {t("loading")}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <FormField
                                    control={form.control}
                                    name="roles"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-col items-start">
                                            <FormLabel>{t("roles")}</FormLabel>
                                            <FormControl>
                                                <TagInput
                                                    {...field}
                                                    activeTagIndex={
                                                        activeRolesTagIndex
                                                    }
                                                    setActiveTagIndex={
                                                        setActiveRolesTagIndex
                                                    }
                                                    placeholder={t(
                                                        "accessRoleSelect2"
                                                    )}
                                                    size="sm"
                                                    tags={
                                                        form.getValues()
                                                            .roles ?? []
                                                    }
                                                    setTags={(newRoles) =>
                                                        form.setValue(
                                                            "roles",
                                                            newRoles as [
                                                                Tag,
                                                                ...Tag[]
                                                            ]
                                                        )
                                                    }
                                                    enableAutocomplete={true}
                                                    autocompleteOptions={
                                                        allRoles
                                                    }
                                                    allowDuplicates={false}
                                                    restrictTagsToAutocompleteOptions={
                                                        true
                                                    }
                                                    sortTags={true}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="users"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-col items-start">
                                            <FormLabel>{t("users")}</FormLabel>
                                            <FormControl>
                                                <TagInput
                                                    {...field}
                                                    activeTagIndex={
                                                        activeUsersTagIndex
                                                    }
                                                    setActiveTagIndex={
                                                        setActiveUsersTagIndex
                                                    }
                                                    placeholder={t(
                                                        "accessUserSelect"
                                                    )}
                                                    tags={
                                                        form.getValues()
                                                            .users ?? []
                                                    }
                                                    size="sm"
                                                    setTags={(newUsers) =>
                                                        form.setValue(
                                                            "users",
                                                            newUsers as [
                                                                Tag,
                                                                ...Tag[]
                                                            ]
                                                        )
                                                    }
                                                    enableAutocomplete={true}
                                                    autocompleteOptions={
                                                        allUsers
                                                    }
                                                    allowDuplicates={false}
                                                    restrictTagsToAutocompleteOptions={
                                                        true
                                                    }
                                                    sortTags={true}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                {hasMachineClients && (
                                    <FormField
                                        control={form.control}
                                        name="clients"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-col items-start">
                                                <FormLabel>
                                                    {t("machineClients")}
                                                </FormLabel>
                                                <FormControl>
                                                    <TagInput
                                                        {...field}
                                                        activeTagIndex={
                                                            activeClientsTagIndex
                                                        }
                                                        setActiveTagIndex={
                                                            setActiveClientsTagIndex
                                                        }
                                                        placeholder={
                                                            t(
                                                                "accessClientSelect"
                                                            ) ||
                                                            "Select machine clients"
                                                        }
                                                        size="sm"
                                                        tags={
                                                            form.getValues()
                                                                .clients ?? []
                                                        }
                                                        setTags={(newClients) =>
                                                            form.setValue(
                                                                "clients",
                                                                newClients as [
                                                                    Tag,
                                                                    ...Tag[]
                                                                ]
                                                            )
                                                        }
                                                        enableAutocomplete={
                                                            true
                                                        }
                                                        autocompleteOptions={
                                                            allClients
                                                        }
                                                        allowDuplicates={false}
                                                        restrictTagsToAutocompleteOptions={
                                                            true
                                                        }
                                                        sortTags={true}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                )}
                            </div>
                        )}
                    </div>

                    {/* SSH Access tab */}
                    {!disableEnterpriseFeatures && (
                    <div className="space-y-4 mt-4">
                        <PaidFeaturesAlert tiers={tierMatrix.sshPam} />
                        <div className="mb-8">
                            <label className="font-medium block">
                                {t("internalResourceAuthDaemonStrategy")}
                            </label>
                            <div className="text-sm text-muted-foreground">
                                {t.rich(
                                    "internalResourceAuthDaemonDescription",
                                    {
                                        docsLink: (chunks) => (
                                            <a
                                                href={
                                                    "https://docs.pangolin.net/manage/ssh#setup-choose-your-architecture"
                                                }
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={
                                                    "text-primary inline-flex items-center gap-1"
                                                }
                                            >
                                                {chunks}
                                                <ExternalLink className="size-3.5 shrink-0" />
                                            </a>
                                        )
                                    }
                                )}
                            </div>
                        </div>
                        <div className="space-y-4">
                            <FormField
                                control={form.control}
                                name="authDaemonMode"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>
                                            {t(
                                                "internalResourceAuthDaemonStrategyLabel"
                                            )}
                                        </FormLabel>
                                        <FormControl>
                                            <StrategySelect<"site" | "remote">
                                                value={field.value ?? undefined}
                                                options={[
                                                    {
                                                        id: "site",
                                                        title: t(
                                                            "internalResourceAuthDaemonSite"
                                                        ),
                                                        description: t(
                                                            "internalResourceAuthDaemonSiteDescription"
                                                        ),
                                                        disabled: sshSectionDisabled
                                                    },
                                                    {
                                                        id: "remote",
                                                        title: t(
                                                            "internalResourceAuthDaemonRemote"
                                                        ),
                                                        description: t(
                                                            "internalResourceAuthDaemonRemoteDescription"
                                                        ),
                                                        disabled: sshSectionDisabled
                                                    }
                                                ]}
                                                onChange={(v) => {
                                                    if (sshSectionDisabled) return;
                                                    field.onChange(v);
                                                    if (v === "site") {
                                                        form.setValue(
                                                            "authDaemonPort",
                                                            null
                                                        );
                                                    }
                                                }}
                                                cols={2}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            {authDaemonMode === "remote" && (
                                <FormField
                                    control={form.control}
                                    name="authDaemonPort"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                {t(
                                                    "internalResourceAuthDaemonPort"
                                                )}
                                            </FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    max={65535}
                                                    placeholder="22123"
                                                    {...field}
                                                    disabled={sshSectionDisabled}
                                                    value={field.value ?? ""}
                                                    onChange={(e) => {
                                                        if (sshSectionDisabled) return;
                                                        const v =
                                                            e.target.value;
                                                        if (v === "") {
                                                            field.onChange(
                                                                null
                                                            );
                                                            return;
                                                        }
                                                        const num = parseInt(
                                                            v,
                                                            10
                                                        );
                                                        field.onChange(
                                                            Number.isNaN(num)
                                                                ? null
                                                                : num
                                                        );
                                                    }}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}
                        </div>
                    </div>
                    )}
                </HorizontalTabs>
            </form>
        </Form>
    );
}
