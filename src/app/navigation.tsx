import { SidebarNavItem } from "@app/components/SidebarNav";
import { Env } from "@app/lib/types/env";
import { build } from "@server/build";
import {
    ChartLine,
    Combine,
    CreditCard,
    Fingerprint,
    Globe,
    GlobeLock,
    KeyRound,
    Laptop,
    Link as LinkIcon,
    Logs, // Added from 'dev' branch
    MonitorUp,
    ReceiptText,
    ScanEye, // Added from 'dev' branch
    Server,
    Settings,
    SquareMousePointer,
    TicketCheck,
    User,
    UserCog,
    Users,
    Waypoints
} from "lucide-react";

export type SidebarNavSection = {
    // Added from 'dev' branch
    heading: string;
    items: SidebarNavItem[];
};

// Merged from 'user-management-and-resources' branch
export const orgLangingNavItems: SidebarNavItem[] = [
    {
        title: "sidebarAccount",
        href: "/{orgId}",
        icon: <User className="size-4 flex-none" />
    }
];

export const orgNavSections = (env?: Env): SidebarNavSection[] => [
    {
        heading: "sidebarGeneral",
        items: [
            {
                title: "sidebarSites",
                href: "/{orgId}/settings/sites",
                icon: <Combine className="size-4 flex-none" />
            },
            {
                title: "sidebarResources",
                icon: <Waypoints className="size-4 flex-none" />,
                items: [
                    {
                        title: "sidebarProxyResources",
                        href: "/{orgId}/settings/resources/proxy",
                        icon: <Globe className="size-4 flex-none" />
                    },
                    {
                        title: "sidebarClientResources",
                        href: "/{orgId}/settings/resources/client",
                        icon: <GlobeLock className="size-4 flex-none" />
                    }
                ]
            },
            {
                title: "sidebarClients",
                icon: <MonitorUp className="size-4 flex-none" />,
                items: [
                    {
                        href: "/{orgId}/settings/clients/user",
                        title: "sidebarUserDevices",
                        icon: <Laptop className="size-4 flex-none" />
                    },
                    {
                        href: "/{orgId}/settings/clients/machine",
                        title: "sidebarMachineClients",
                        icon: <Server className="size-4 flex-none" />
                    }
                ]
            },
            {
                title: "sidebarDomains",
                href: "/{orgId}/settings/domains",
                icon: <Globe className="size-4 flex-none" />
            },
            ...(build == "saas"
                ? [
                      {
                          title: "sidebarRemoteExitNodes",
                          href: "/{orgId}/settings/remote-exit-nodes",
                          icon: <Server className="size-4 flex-none" />
                      }
                  ]
                : [])
        ]
    },
    {
        heading: "access",
        items: [
            {
                title: "sidebarUsers",
                icon: <User className="size-4 flex-none" />,
                items: [
                    {
                        title: "sidebarUsers",
                        href: "/{orgId}/settings/access/users",
                        icon: <User className="size-4 flex-none" />
                    },
                    {
                        title: "sidebarInvitations",
                        href: "/{orgId}/settings/access/invitations",
                        icon: <TicketCheck className="size-4 flex-none" />
                    }
                ]
            },
            {
                title: "sidebarRoles",
                href: "/{orgId}/settings/access/roles",
                icon: <Users className="size-4 flex-none" />
            },
            // PaidFeaturesAlert
            ...((build === "oss" && !env?.flags.disableEnterpriseFeatures) ||
            build === "saas" ||
            env?.flags.useOrgOnlyIdp
                ? [
                      {
                          title: "sidebarIdentityProviders",
                          href: "/{orgId}/settings/idp",
                          icon: <Fingerprint className="size-4 flex-none" />
                      }
                  ]
                : []),
            ...(!env?.flags.disableEnterpriseFeatures
                ? [
                      {
                          title: "sidebarApprovals",
                          href: "/{orgId}/settings/access/approvals",
                          icon: <UserCog className="size-4 flex-none" />
                      }
                  ]
                : []),
            {
                title: "sidebarShareableLinks",
                href: "/{orgId}/settings/share-links",
                icon: <LinkIcon className="size-4 flex-none" />
            }
        ]
    },
    {
        heading: "sidebarLogsAndAnalytics",
        items: (() => {
            const logItems: SidebarNavItem[] = [
                {
                    title: "sidebarLogsRequest",
                    href: "/{orgId}/settings/logs/request",
                    icon: <SquareMousePointer className="size-4 flex-none" />
                },
                ...(!env?.flags.disableEnterpriseFeatures
                    ? [
                          {
                              title: "sidebarLogsAccess",
                              href: "/{orgId}/settings/logs/access",
                              icon: <ScanEye className="size-4 flex-none" />
                          },
                          {
                              title: "sidebarLogsAction",
                              href: "/{orgId}/settings/logs/action",
                              icon: <Logs className="size-4 flex-none" />
                          }
                      ]
                    : [])
            ];

            const analytics = {
                title: "sidebarLogsAnalytics",
                href: "/{orgId}/settings/logs/analytics",
                icon: <ChartLine className="h-4 w-4" />
            };

            // If only one log item, return it directly without grouping
            if (logItems.length === 1) {
                return [analytics, ...logItems];
            }

            // If multiple log items, create a group
            return [
                analytics,
                {
                    title: "sidebarLogs",
                    icon: <Logs className="size-4 flex-none" />,
                    items: logItems
                }
            ];
        })()
    },
    {
        heading: "sidebarOrganization",
        items: [
            {
                title: "sidebarApiKeys",
                href: "/{orgId}/settings/api-keys",
                icon: <KeyRound className="size-4 flex-none" />
            },
            {
                title: "sidebarBluePrints",
                href: "/{orgId}/settings/blueprints",
                icon: <ReceiptText className="size-4 flex-none" />
            },
            {
                title: "sidebarSettings",
                href: "/{orgId}/settings/general",
                icon: <Settings className="size-4 flex-none" />
            },

            ...(build == "saas"
                ? [
                      {
                          title: "sidebarBilling",
                          href: "/{orgId}/settings/billing",
                          icon: <CreditCard className="size-4 flex-none" />
                      }
                  ]
                : []),
            ...(build == "saas"
                ? [
                      {
                          title: "sidebarEnterpriseLicenses",
                          href: "/{orgId}/settings/license",
                          icon: <TicketCheck className="size-4 flex-none" />
                      }
                  ]
                : [])
        ]
    }
];

export const adminNavSections = (env?: Env): SidebarNavSection[] => [
    {
        heading: "sidebarAdmin",
        items: [
            {
                title: "sidebarAllUsers",
                href: "/admin/users",
                icon: <Users className="size-4 flex-none" />
            },
            {
                title: "sidebarApiKeys",
                href: "/admin/api-keys",
                icon: <KeyRound className="size-4 flex-none" />
            },
            ...(build === "oss" || !env?.flags.useOrgOnlyIdp
                ? [
                      {
                          title: "sidebarIdentityProviders",
                          href: "/admin/idp",
                          icon: <Fingerprint className="size-4 flex-none" />
                      }
                  ]
                : []),
            ...(build == "enterprise"
                ? [
                      {
                          title: "sidebarLicense",
                          href: "/admin/license",
                          icon: <TicketCheck className="size-4 flex-none" />
                      }
                  ]
                : [])
        ]
    }
];
