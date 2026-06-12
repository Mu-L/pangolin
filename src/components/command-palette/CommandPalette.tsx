"use client";

import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator
} from "@app/components/ui/command";
import type { SidebarNavSection } from "@app/app/navigation";
import { Badge } from "@app/components/ui/badge";
import { ListUserOrgsResponse } from "@server/routers/org";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState
} from "react";
import { useTranslations } from "next-intl";
import { useCommandPaletteActions } from "./useCommandPaletteActions";
import { useCommandPaletteNavigation } from "./useCommandPaletteNavigation";
import { useCommandPaletteOrganizations } from "./useCommandPaletteOrganizations";
import { useCommandPaletteSearch } from "./useCommandPaletteSearch";
import { useUserContext } from "@app/hooks/useUserContext";

type CommandPaletteProps = {
    orgId?: string;
    orgs?: ListUserOrgsResponse["orgs"];
    navItems: SidebarNavSection[];
};

/**
 * Plan for command bar:
 * - the nav items should be custom items instead of all of the ones in the sidebar
 * - actions should be triggered by using `>` (like in Github)
 */

export function CommandPalette({ orgId, orgs, navItems }: CommandPaletteProps) {
    const t = useTranslations();
    const router = useRouter();
    const { open, setOpen } = useCommandPalette();
    const [search, setSearch] = useState("");

    const navigationGroups = useCommandPaletteNavigation(navItems);
    // const organizations = useCommandPaletteOrganizations(orgs);
    const actions = useCommandPaletteActions(orgId, orgs);
    const { shouldSearch, sites, resources, users, machineClients, isLoading } =
        useCommandPaletteSearch({
            orgId,
            query: search,
            enabled: open
        });

    const handleOpenChange = useCallback(
        (nextOpen: boolean) => {
            setOpen(nextOpen);
            if (!nextOpen) {
                setSearch("");
            }
        },
        [setOpen]
    );

    const runCommand = useCallback(
        (command: () => void) => {
            setOpen(false);
            setSearch("");
            command();
        },
        [setOpen]
    );

    // const hasEntityResults =
    //     sites.length > 0 ||
    //     resources.length > 0 ||
    //     users.length > 0 ||
    //     machineClients.length > 0;

    return (
        <CommandDialog
            open //={open}
            onOpenChange={handleOpenChange}
            title={t("commandPaletteTitle")}
            description={t("commandPaletteDescription")}
            className="max-w-2xl **:data-[slot=command-input-wrapper]:h-15"
        >
            <CommandInput
                placeholder={t("commandPaletteSearchPlaceholder")}
                value={search}
                onValueChange={setSearch}
            />
            <CommandList className="max-h-125 min-h-0 h-auto">
                <CommandEmpty>{t("commandPaletteNoResults")}</CommandEmpty>

                <CommandGroup
                    heading='Type ">" to open action mode'
                    className="[&_[cmdk-group-heading]]:text-sm"
                />

                {navigationGroups.map((group, idx) => (
                    <React.Fragment key={group.heading}>
                        {idx > 0 && <CommandSeparator />}
                        <CommandGroup
                            heading={group.heading}
                            className="[&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-sm pb-2.5"
                        >
                            {group.items.map((item) => (
                                <CommandItem
                                    key={item.id}
                                    value={`${item.title} ${group.heading}`}
                                    onSelect={() =>
                                        runCommand(() => router.push(item.href))
                                    }
                                    className="h-9"
                                >
                                    {item.icon}
                                    <span>{item.title}</span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </React.Fragment>
                ))}

                {/* {organizations.length > 1 && (
                    <>
                        <CommandSeparator />
                        <CommandGroup
                            heading={t("commandPaletteOrganizations")}
                        >
                            {organizations.map((org) => (
                                <CommandItem
                                    key={org.id}
                                    value={`${org.name} ${org.orgId}`}
                                    onSelect={() =>
                                        runCommand(() => router.push(org.href))
                                    }
                                >
                                    <span className="truncate">{org.name}</span>
                                    <span className="text-xs text-muted-foreground font-mono truncate">
                                        {org.orgId}
                                    </span>
                                    {org.isPrimaryOrg && (
                                        <Badge
                                            variant="outline"
                                            className="ml-auto shrink-0 text-[10px] px-1.5 py-0"
                                        >
                                            {t("primary")}
                                        </Badge>
                                    )}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </>
                )} */}

                {/* {shouldSearch && orgId && (
                    <>
                        <CommandSeparator />
                        {isLoading && !hasEntityResults ? (
                            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                                <Loader2 className="size-4 animate-spin" />
                                {t("commandPaletteSearching")}
                            </div>
                        ) : (
                            <>
                                {sites.length > 0 && (
                                    <CommandGroup
                                        heading={t("commandPaletteSites")}
                                    >
                                        {sites.map((site) => (
                                            <CommandItem
                                                key={site.id}
                                                value={`${site.name} site`}
                                                onSelect={() =>
                                                    runCommand(() =>
                                                        router.push(site.href)
                                                    )
                                                }
                                            >
                                                <span className="truncate">
                                                    {site.name}
                                                </span>
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                )}
                                {resources.length > 0 && (
                                    <CommandGroup
                                        heading={t("commandPaletteResources")}
                                    >
                                        {resources.map((resource) => (
                                            <CommandItem
                                                key={resource.id}
                                                value={`${resource.name} resource`}
                                                onSelect={() =>
                                                    runCommand(() =>
                                                        router.push(
                                                            resource.href
                                                        )
                                                    )
                                                }
                                            >
                                                <span className="truncate">
                                                    {resource.name}
                                                </span>
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                )}
                                {users.length > 0 && (
                                    <CommandGroup
                                        heading={t("commandPaletteUsers")}
                                    >
                                        {users.map((user) => (
                                            <CommandItem
                                                key={user.id}
                                                value={`${user.name} ${user.email}`}
                                                onSelect={() =>
                                                    runCommand(() =>
                                                        router.push(user.href)
                                                    )
                                                }
                                            >
                                                <div className="flex min-w-0 flex-col">
                                                    <span className="truncate">
                                                        {user.name}
                                                    </span>
                                                    <span className="truncate text-xs text-muted-foreground">
                                                        {user.email}
                                                    </span>
                                                </div>
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                )}
                                {machineClients.length > 0 && (
                                    <CommandGroup
                                        heading={t("commandPaletteClients")}
                                    >
                                        {machineClients.map((client) => (
                                            <CommandItem
                                                key={client.id}
                                                value={`${client.name} client`}
                                                onSelect={() =>
                                                    runCommand(() =>
                                                        router.push(client.href)
                                                    )
                                                }
                                            >
                                                <span className="truncate">
                                                    {client.name}
                                                </span>
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                )}
                            </>
                        )}
                    </>
                )} */}

                {/* {actions.length > 0 && (
                    <>
                        <CommandSeparator />
                        <CommandGroup
                            heading={t("commandPaletteActions")}
                            className="pb-2.5"
                        >
                            {actions.map((action) => (
                                <CommandItem
                                    key={action.id}
                                    value={action.label}
                                    onSelect={() =>
                                        runCommand(() => {
                                            if (action.onSelect) {
                                                action.onSelect();
                                            } else if (action.href) {
                                                router.push(action.href);
                                            }
                                        })
                                    }
                                >
                                    {action.icon}
                                    <span>{action.label}</span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </>
                )} */}
            </CommandList>
        </CommandDialog>
    );
}

/*******************************/
/*   COMMAND PALETTE CONTEXT   */
/*******************************/
export type CommandPaletteContextValue = {
    open: boolean;
    setOpen: (open: boolean) => void;
    toggle: () => void;
};

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(
    null
);

export function useCommandPalette() {
    const context = useContext(CommandPaletteContext);
    if (!context) {
        throw new Error(
            "useCommandPalette must be used within CommandPaletteProvider"
        );
    }
    return context;
}

//*******************************/
/*   COMMAND PALETTE PROVIDER   */
/*******************************/
type CommandPaletteProviderProps = {
    children: React.ReactNode;
    orgId?: string;
    orgs?: ListUserOrgsResponse["orgs"];
    navItems: SidebarNavSection[];
};

function isEditableTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tagName = target.tagName;
    return (
        tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT"
    );
}

export function CommandPaletteProvider({
    children,
    orgId,
    orgs,
    navItems
}: CommandPaletteProviderProps) {
    const [open, setOpen] = useState(false);

    const toggle = useCallback(() => {
        setOpen((current) => !current);
    }, []);

    const contextValue = useMemo<CommandPaletteContextValue>(
        () => ({
            open,
            setOpen,
            toggle
        }),
        [open, toggle]
    );

    useEffect(() => {
        function onKeyDown(event: KeyboardEvent) {
            if (
                event.key.toLowerCase() !== "k" ||
                !(event.metaKey || event.ctrlKey)
            ) {
                return;
            }

            if (!open && isEditableTarget(event.target)) {
                return;
            }

            event.preventDefault();
            toggle();
        }

        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [open, toggle]);

    return (
        <CommandPaletteContext value={contextValue}>
            {children}
            <CommandPalette orgId={orgId} orgs={orgs} navItems={navItems} />
        </CommandPaletteContext>
    );
}
