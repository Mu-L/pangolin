"use client";

import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator
} from "@app/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@app/components/ui/popover";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger
} from "@app/components/ui/tooltip";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { cn } from "@app/lib/cn";
import { ListUserOrgsResponse } from "@server/routers/org";
import { Check, ChevronsUpDown, Plus, Building2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useUserContext } from "@app/hooks/useUserContext";
import { useTranslations } from "next-intl";

interface OrgSelectorProps {
    orgId?: string;
    orgs?: ListUserOrgsResponse["orgs"];
    isCollapsed?: boolean;
}

export function OrgSelector({
    orgId,
    orgs,
    isCollapsed = false
}: OrgSelectorProps) {
    const { user } = useUserContext();
    const [open, setOpen] = useState(false);
    const router = useRouter();
    const { env } = useEnvContext();
    const t = useTranslations();

    const selectedOrg = orgs?.find((org) => org.orgId === orgId);

    const orgSelectorContent = (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <div
                    role="combobox"
                    aria-expanded={open}
                    className={cn(
                        "cursor-pointer transition-colors",
                        isCollapsed
                            ? "w-full h-16 flex items-center justify-center hover:bg-muted"
                            : "w-full px-4 py-4 hover:bg-muted"
                    )}
                >
                    {isCollapsed ? (
                        <Building2 className="h-4 w-4" />
                    ) : (
                        <div className="flex items-center justify-between w-full min-w-0">
                            <div className="flex items-center min-w-0 flex-1">
                                <div className="flex flex-col items-start min-w-0 flex-1 gap-1">
                                    <span className="font-bold">
                                        {t("org")}
                                    </span>
                                    <span className="text-sm text-muted-foreground truncate w-full text-left">
                                        {selectedOrg?.name || t("noneSelected")}
                                    </span>
                                </div>
                            </div>
                            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
                        </div>
                    )}
                </div>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0" align="start">
                <Command className="rounded-lg">
                    <CommandInput
                        placeholder={t("searchProgress")}
                        className="border-0 focus:ring-0"
                    />
                    <CommandEmpty className="py-6 text-center">
                        <div className="text-muted-foreground text-sm">
                            {t("orgNotFound2")}
                        </div>
                    </CommandEmpty>
                    {(!env.flags.disableUserCreateOrg || user.serverAdmin) && (
                        <>
                            <CommandGroup
                                heading={t("create")}
                                className="py-2"
                            >
                                <CommandList>
                                    <CommandItem
                                        onSelect={() => {
                                            setOpen(false);
                                            router.push("/setup");
                                        }}
                                        className="mx-2 rounded-md"
                                    >
                                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 mr-3">
                                            <Plus className="h-4 w-4 text-primary" />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="font-medium">
                                                {t("setupNewOrg")}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {t("createNewOrgDescription")}
                                            </span>
                                        </div>
                                    </CommandItem>
                                </CommandList>
                            </CommandGroup>
                            <CommandSeparator className="my-2" />
                        </>
                    )}
                    <CommandGroup heading={t("orgs")} className="py-2">
                        <CommandList>
                            {orgs?.map((org) => (
                                <CommandItem
                                    key={org.orgId}
                                    onSelect={() => {
                                        setOpen(false);
                                        router.push(`/${org.orgId}/settings`);
                                    }}
                                    className="mx-2 rounded-md"
                                >
                                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted mr-3">
                                        <Users className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                    <div className="flex flex-col flex-1">
                                        <span className="font-medium">
                                            {org.name}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {t("organization")}
                                        </span>
                                    </div>
                                    <Check
                                        className={cn(
                                            "h-4 w-4 text-primary",
                                            orgId === org.orgId
                                                ? "opacity-100"
                                                : "opacity-0"
                                        )}
                                    />
                                </CommandItem>
                            ))}
                        </CommandList>
                    </CommandGroup>
                </Command>
            </PopoverContent>
        </Popover>
    );

    if (isCollapsed) {
        return (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        {orgSelectorContent}
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8}>
                        <div className="text-center">
                            <p className="font-medium">
                                {selectedOrg?.name || t("noneSelected")}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {t("org")}
                            </p>
                        </div>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    }

    return orgSelectorContent;
}
