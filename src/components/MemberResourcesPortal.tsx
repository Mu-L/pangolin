"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import {
    ExternalLink,
    Globe,
    Search,
    RefreshCw,
    AlertCircle,
    ChevronLeft,
    ChevronRight,
    Key,
    KeyRound,
    Fingerprint,
    AtSign,
    Copy,
    InfoIcon,
    Combine
} from "lucide-react";
import { createApiClient } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { GetUserResourcesResponse } from "@server/routers/resource/getUserResources";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import { useToast } from "@app/hooks/useToast";
import { InfoPopup } from "@/components/ui/info-popup";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger
} from "@/components/ui/tooltip";

// Update Resource type to include site information
type Resource = {
    resourceId: number;
    name: string;
    domain: string;
    enabled: boolean;
    protected: boolean;
    protocol: string;
    // Auth method fields
    sso?: boolean;
    password?: boolean;
    pincode?: boolean;
    whitelist?: boolean;
    // Site information
    siteName?: string | null;
};

type SiteResource = {
    siteResourceId: number;
    name: string;
    destination: string;
    mode: string;
    protocol: string | null;
    enabled: boolean;
    alias: string | null;
    aliasAddress: string | null;
    type: 'site';
};

type MemberResourcesPortalProps = {
    orgId: string;
};

// Favicon component with fallback
const ResourceFavicon = ({
    domain,
    enabled
}: {
    domain: string;
    enabled: boolean;
}) => {
    const [faviconError, setFaviconError] = useState(false);
    const [faviconLoaded, setFaviconLoaded] = useState(false);

    // Extract domain for favicon URL
    const cleanDomain = domain.replace(/^https?:\/\//, "").split("/")[0];
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${cleanDomain}&sz=32`;

    const handleFaviconLoad = () => {
        setFaviconLoaded(true);
        setFaviconError(false);
    };

    const handleFaviconError = () => {
        setFaviconError(true);
        setFaviconLoaded(false);
    };

    if (faviconError || !enabled) {
        return (
            <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        );
    }

    return (
        <div className="relative h-4 w-4 flex-shrink-0">
            {!faviconLoaded && (
                <div className="absolute inset-0 bg-muted animate-pulse rounded-sm"></div>
            )}
            <img
                src={faviconUrl}
                alt={`${cleanDomain} favicon`}
                className={`h-4 w-4 rounded-sm transition-opacity ${faviconLoaded ? "opacity-100" : "opacity-0"}`}
                onLoad={handleFaviconLoad}
                onError={handleFaviconError}
            />
        </div>
    );
};

// Resource Info component
const ResourceInfo = ({ resource }: { resource: Resource }) => {
    const hasAuthMethods =
        resource.sso ||
        resource.password ||
        resource.pincode ||
        resource.whitelist;

    const infoContent = (
        <div className="flex flex-col gap-3">
            {/* Site Information */}
            {resource.siteName && (
                <div>
                    <div className="text-xs font-medium mb-1.5">Site</div>
                    <div className="flex items-center gap-2">
                        <Combine className="h-4 w-4 text-foreground shrink-0" />
                        <span className="text-sm">{resource.siteName}</span>
                    </div>
                </div>
            )}

            {/* Authentication Methods */}
            {hasAuthMethods && (
                <div
                    className={
                        resource.siteName ? "border-t border-border pt-2" : ""
                    }
                >
                    <div className="text-xs font-medium mb-1.5">
                        Authentication Methods
                    </div>
                    <div className="flex flex-col gap-1.5">
                        {resource.sso && (
                            <div className="flex items-center gap-2">
                                <div className="h-5 w-5 rounded-full flex items-center justify-center bg-blue-50/50 dark:bg-blue-950/50">
                                    <Key className="h-3 w-3 text-blue-700 dark:text-blue-300" />
                                </div>
                                <span className="text-sm">
                                    Single Sign-On (SSO)
                                </span>
                            </div>
                        )}
                        {resource.password && (
                            <div className="flex items-center gap-2">
                                <div className="h-5 w-5 rounded-full flex items-center justify-center bg-purple-50/50 dark:bg-purple-950/50">
                                    <KeyRound className="h-3 w-3 text-purple-700 dark:text-purple-300" />
                                </div>
                                <span className="text-sm">
                                    Password Protected
                                </span>
                            </div>
                        )}
                        {resource.pincode && (
                            <div className="flex items-center gap-2">
                                <div className="h-5 w-5 rounded-full flex items-center justify-center bg-emerald-50/50 dark:bg-emerald-950/50">
                                    <Fingerprint className="h-3 w-3 text-emerald-700 dark:text-emerald-300" />
                                </div>
                                <span className="text-sm">PIN Code</span>
                            </div>
                        )}
                        {resource.whitelist && (
                            <div className="flex items-center gap-2">
                                <div className="h-5 w-5 rounded-full flex items-center justify-center bg-amber-50/50 dark:bg-amber-950/50">
                                    <AtSign className="h-3 w-3 text-amber-700 dark:text-amber-300" />
                                </div>
                                <span className="text-sm">Email Whitelist</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Resource Status - if disabled */}
            {!resource.enabled && (
                <div
                    className={`${resource.siteName || hasAuthMethods ? "border-t border-border pt-2" : ""}`}
                >
                    <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                        <span className="text-sm text-destructive">
                            Resource Disabled
                        </span>
                    </div>
                </div>
            )}
        </div>
    );

    return <InfoPopup>{infoContent}</InfoPopup>;
};

// Pagination component
const PaginationControls = ({
    currentPage,
    totalPages,
    onPageChange,
    totalItems,
    itemsPerPage
}: {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    totalItems: number;
    itemsPerPage: number;
}) => {
    const startItem = (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);

    if (totalPages <= 1) return null;

    return (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-8">
            <div className="text-sm text-muted-foreground">
                Showing {startItem}-{endItem} of {totalItems} resources
            </div>

            <div className="flex items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="gap-1"
                >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                </Button>

                <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                        (page) => {
                            // Show first page, last page, current page, and 2 pages around current
                            const showPage =
                                page === 1 ||
                                page === totalPages ||
                                Math.abs(page - currentPage) <= 1;

                            const showEllipsis =
                                (page === 2 && currentPage > 4) ||
                                (page === totalPages - 1 &&
                                    currentPage < totalPages - 3);

                            if (!showPage && !showEllipsis) return null;

                            if (showEllipsis) {
                                return (
                                    <span
                                        key={page}
                                        className="px-2 text-muted-foreground"
                                    >
                                        ...
                                    </span>
                                );
                            }

                            return (
                                <Button
                                    key={page}
                                    variant={
                                        currentPage === page
                                            ? "default"
                                            : "outline"
                                    }
                                    size="sm"
                                    onClick={() => onPageChange(page)}
                                    className="w-8 h-8 p-0"
                                >
                                    {page}
                                </Button>
                            );
                        }
                    )}
                </div>

                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="gap-1"
                >
                    Next
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
};

// Loading skeleton component
const ResourceCardSkeleton = () => (
    <Card className="rounded-lg bg-card text-card-foreground flex flex-col w-full animate-pulse">
        <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
                <div className="h-6 bg-muted rounded w-3/4"></div>
                <div className="h-5 bg-muted rounded w-16"></div>
            </div>
        </CardHeader>
        <CardContent className="px-6 pb-6 flex-1 flex flex-col justify-between">
            <div className="space-y-3">
                <div className="flex items-center space-x-2">
                    <div className="h-4 w-4 bg-muted rounded"></div>
                    <div className="h-4 bg-muted rounded w-1/2"></div>
                </div>
                <div className="flex items-center space-x-2">
                    <div className="h-4 w-4 bg-muted rounded"></div>
                    <div className="h-4 bg-muted rounded w-1/3"></div>
                </div>
            </div>
            <div className="mt-4">
                <div className="h-8 bg-muted rounded w-full"></div>
            </div>
        </CardContent>
    </Card>
);

export default function MemberResourcesPortal({
    orgId
}: MemberResourcesPortalProps) {
    const t = useTranslations();
    const { env } = useEnvContext();
    const api = createApiClient({ env });
    const { toast } = useToast();

    const [resources, setResources] = useState<Resource[]>([]);
    const [siteResources, setSiteResources] = useState<SiteResource[]>([]);
    const [filteredResources, setFilteredResources] = useState<Resource[]>([]);
    const [filteredSiteResources, setFilteredSiteResources] = useState<SiteResource[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState("name-asc");
    const [refreshing, setRefreshing] = useState(false);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 12; // 3x4 grid on desktop

    const fetchUserResources = async (isRefresh = false) => {
        try {
            if (isRefresh) {
                setRefreshing(true);
            } else {
                setLoading(true);
            }
            setError(null);

            const response = await api.get<GetUserResourcesResponse>(
                `/org/${orgId}/user-resources`
            );

            if (response.data.success) {
                setResources(response.data.data.resources);
                setSiteResources(response.data.data.siteResources || []);
                setFilteredResources(response.data.data.resources);
                setFilteredSiteResources(response.data.data.siteResources || []);
            } else {
                setError("Failed to load resources");
            }
        } catch (err) {
            console.error("Error fetching user resources:", err);
            setError(
                "Failed to load resources. Please check your connection and try again."
            );
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchUserResources();
    }, [orgId, api]);

    // Filter and sort resources
    useEffect(() => {
        const filtered = resources.filter(
            (resource) =>
                resource.name
                    .toLowerCase()
                    .includes(searchQuery.toLowerCase()) ||
                resource.domain
                    .toLowerCase()
                    .includes(searchQuery.toLowerCase())
        );

        // Sort resources
        filtered.sort((a, b) => {
            switch (sortBy) {
                case "name-asc":
                    return a.name.localeCompare(b.name);
                case "name-desc":
                    return b.name.localeCompare(a.name);
                case "domain-asc":
                    return a.domain.localeCompare(b.domain);
                case "domain-desc":
                    return b.domain.localeCompare(a.domain);
                case "status-enabled":
                    // Enabled first, then protected vs unprotected
                    if (a.enabled !== b.enabled) return b.enabled ? 1 : -1;
                    return b.protected ? 1 : -1;
                case "status-disabled":
                    // Disabled first, then unprotected vs protected
                    if (a.enabled !== b.enabled) return a.enabled ? 1 : -1;
                    return a.protected ? 1 : -1;
                default:
                    return a.name.localeCompare(b.name);
            }
        });

        setFilteredResources(filtered);

        // Filter and sort site resources
        const filteredSites = siteResources.filter(
            (resource) =>
                resource.name
                    .toLowerCase()
                    .includes(searchQuery.toLowerCase()) ||
                resource.destination
                    .toLowerCase()
                    .includes(searchQuery.toLowerCase())
        );

        // Sort site resources
        filteredSites.sort((a, b) => {
            switch (sortBy) {
                case "name-asc":
                    return a.name.localeCompare(b.name);
                case "name-desc":
                    return b.name.localeCompare(a.name);
                case "domain-asc":
                case "domain-desc":
                    // Sort by destination for site resources
                    const destCompare = sortBy === "domain-asc" 
                        ? a.destination.localeCompare(b.destination)
                        : b.destination.localeCompare(a.destination);
                    return destCompare;
                case "status-enabled":
                    return b.enabled ? 1 : -1;
                case "status-disabled":
                    return a.enabled ? 1 : -1;
                default:
                    return a.name.localeCompare(b.name);
            }
        });

        setFilteredSiteResources(filteredSites);

        // Reset to first page when search/sort changes
        setCurrentPage(1);
    }, [resources, siteResources, searchQuery, sortBy]);

    // Calculate pagination
    const totalItems = filteredResources.length + filteredSiteResources.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedResources = filteredResources.slice(
        startIndex,
        startIndex + itemsPerPage
    );
    const remainingSlots = itemsPerPage - paginatedResources.length;
    const paginatedSiteResources = remainingSlots > 0 
        ? filteredSiteResources.slice(
            Math.max(0, startIndex - filteredResources.length),
            Math.max(0, startIndex - filteredResources.length) + remainingSlots
          )
        : [];

    const handleOpenResource = (resource: Resource) => {
        // Open the resource in a new tab
        window.open(resource.domain, "_blank");
    };

    const handleRefresh = () => {
        fetchUserResources(true);
    };

    const handleRetry = () => {
        fetchUserResources();
    };

    const handlePageChange = (page: number) => {
        setCurrentPage(page);
        // Scroll to top when page changes
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    if (loading) {
        return (
            <div className="container mx-auto max-w-12xl">
                <SettingsSectionTitle
                    title="Resources"
                    description="Resources you have access to in this organization"
                />

                {/* Search and Sort Controls - Skeleton */}
                <div className="mb-6 flex flex-col sm:flex-row gap-4 justify-start">
                    <div className="relative w-full sm:w-80">
                        <div className="h-10 bg-muted rounded animate-pulse"></div>
                    </div>
                    <div className="w-full sm:w-36">
                        <div className="h-10 bg-muted rounded animate-pulse"></div>
                    </div>
                </div>

                {/* Loading Skeletons */}
                <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 auto-cols-fr">
                    {Array.from({ length: 12 }).map((_, index) => (
                        <ResourceCardSkeleton key={index} />
                    ))}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="container mx-auto max-w-12xl">
                <SettingsSectionTitle
                    title="Resources"
                    description="Resources you have access to in this organization"
                />
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="mb-6">
                            <AlertCircle className="h-16 w-16 text-destructive/60" />
                        </div>
                        <h3 className="text-xl font-semibold text-foreground mb-3">
                            Unable to Load Resources
                        </h3>
                        <p className="text-muted-foreground max-w-lg text-base mb-6">
                            {error}
                        </p>
                        <Button
                            onClick={handleRetry}
                            variant="outline"
                            className="gap-2"
                        >
                            <RefreshCw className="h-4 w-4" />
                            Try Again
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="container mx-auto max-w-12xl">
            <SettingsSectionTitle
                title="Resources"
                description="Resources you have access to in this organization"
            />

            {/* Search and Sort Controls with Refresh */}
            <div className="mb-6 flex flex-col sm:flex-row gap-4 justify-between items-start">
                <div className="flex flex-col sm:flex-row gap-4 justify-start flex-1">
                    {/* Search */}
                    <div className="relative w-full sm:w-80">
                        <Input
                            placeholder="Search resources..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-8 bg-card"
                        />
                        <Search className="h-4 w-4 absolute left-2 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                    </div>

                    {/* Sort */}
                    <div className="w-full sm:w-36">
                        <Select value={sortBy} onValueChange={setSortBy}>
                            <SelectTrigger className="bg-card">
                                <SelectValue placeholder="Sort by..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="name-asc">
                                    Name A-Z
                                </SelectItem>
                                <SelectItem value="name-desc">
                                    Name Z-A
                                </SelectItem>
                                <SelectItem value="domain-asc">
                                    Domain A-Z
                                </SelectItem>
                                <SelectItem value="domain-desc">
                                    Domain Z-A
                                </SelectItem>
                                <SelectItem value="status-enabled">
                                    Enabled First
                                </SelectItem>
                                <SelectItem value="status-disabled">
                                    Disabled First
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Refresh Button */}
                <Button
                    onClick={handleRefresh}
                    variant="outline"
                    size="sm"
                    disabled={refreshing}
                    className="gap-2 shrink-0"
                >
                    <RefreshCw
                        className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                    />
                    Refresh
                </Button>
            </div>

            {/* Resources Content */}
            {filteredResources.length === 0 && filteredSiteResources.length === 0 ? (
                /* Enhanced Empty State */
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="mb-8 p-4 rounded-full bg-muted/20 dark:bg-muted/30">
                            {searchQuery ? (
                                <Search className="h-12 w-12 text-muted-foreground/70" />
                            ) : (
                                <Globe className="h-12 w-12 text-muted-foreground/70" />
                            )}
                        </div>
                        <h3 className="text-2xl font-semibold text-foreground mb-3">
                            {searchQuery
                                ? "No Resources Found"
                                : "No Resources Available"}
                        </h3>
                        <p className="text-muted-foreground max-w-lg text-base mb-6">
                            {searchQuery
                                ? `No resources match "${searchQuery}". Try adjusting your search terms or clearing the search to see all resources.`
                                : "You don't have access to any resources yet. Contact your administrator to get access to resources you need."}
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3">
                            {searchQuery ? (
                                <Button
                                    onClick={() => setSearchQuery("")}
                                    variant="outline"
                                    className="gap-2"
                                >
                                    Clear Search
                                </Button>
                            ) : (
                                <Button
                                    onClick={handleRefresh}
                                    variant="outline"
                                    disabled={refreshing}
                                    className="gap-2"
                                >
                                    <RefreshCw
                                        className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                                    />
                                    Refresh Resources
                                </Button>
                            )}
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <>
                    {/* Public Resources Section */}
                    {paginatedResources.length > 0 && (
                        <>
                            <div className="mb-4">
                                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                                    <Globe className="h-5 w-5" />
                                    Public Resources
                                </h3>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Web applications and services accessible via browser
                                </p>
                            </div>
                            <div className="grid gap-5 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 auto-cols-fr mb-8">
                                {paginatedResources.map((resource) => (
                            <Card key={resource.resourceId}>
                                <div className="p-6">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center min-w-0 flex-1 gap-3 overflow-hidden">
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger className="min-w-0 max-w-full">
                                                        <CardTitle className="text-lg font-bold text-foreground truncate group-hover:text-primary transition-colors">
                                                            {resource.name}
                                                        </CardTitle>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p className="max-w-xs break-words">
                                                            {resource.name}
                                                        </p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        </div>

                                        <div className="flex-shrink-0">
                                            <ResourceInfo resource={resource} />
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 mt-3">
                                        <button
                                            onClick={() =>
                                                handleOpenResource(resource)
                                            }
                                            className="text-sm text-muted-foreground font-medium text-left truncate flex-1"
                                            disabled={!resource.enabled}
                                        >
                                            {resource.domain.replace(
                                                /^https?:\/\//,
                                                ""
                                            )}
                                        </button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-muted-foreground"
                                            onClick={() => {
                                                navigator.clipboard.writeText(
                                                    resource.domain
                                                );
                                                toast({
                                                    title: "Copied to clipboard",
                                                    description:
                                                        "Resource URL has been copied to your clipboard.",
                                                    duration: 2000
                                                });
                                            }}
                                        >
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>

                                <div className="p-6 pt-0 mt-auto">
                                    <Button
                                        onClick={() =>
                                            handleOpenResource(resource)
                                        }
                                        className="w-full h-9 transition-all group-hover:shadow-sm"
                                        variant="outline"
                                        size="sm"
                                        disabled={!resource.enabled}
                                    >
                                        <ExternalLink className="h-3.5 w-3.5 mr-2" />
                                        Open Resource
                                    </Button>
                                </div>
                            </Card>
                        ))}
                    </div>
                        </>
                    )}

                    {/* Private Resources (Site Resources) Section */}
                    {paginatedSiteResources.length > 0 && (
                        <>
                            <div className="mb-4">
                                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                                    <Combine className="h-5 w-5" />
                                    Private Resources
                                </h3>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Internal network resources accessible via client
                                </p>
                            </div>
                            <div className="grid gap-5 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 auto-cols-fr mb-8">
                                {paginatedSiteResources.map((siteResource) => (
                                    <Card key={siteResource.siteResourceId}>
                                        <div className="p-6">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="flex items-center min-w-0 flex-1 gap-3 overflow-hidden">
                                                    <TooltipProvider>
                                                        <Tooltip>
                                                            <TooltipTrigger className="min-w-0 max-w-full">
                                                                <CardTitle className="text-lg font-bold text-foreground truncate group-hover:text-primary transition-colors">
                                                                    {siteResource.name}
                                                                </CardTitle>
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                <p className="max-w-xs break-words">
                                                                    {siteResource.name}
                                                                </p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                </div>

                                                <div className="flex-shrink-0">
                                                    <InfoPopup>
                                                        <div className="space-y-2 text-sm">
                                                            <div className="text-xs font-medium mb-1.5">Resource Details</div>
                                                            <div>
                                                                <span className="font-medium">Mode:</span>
                                                                <span className="ml-2 text-muted-foreground capitalize">
                                                                    {siteResource.mode}
                                                                </span>
                                                            </div>
                                                            {siteResource.protocol && (
                                                                <div>
                                                                    <span className="font-medium">Protocol:</span>
                                                                    <span className="ml-2 text-muted-foreground uppercase">
                                                                        {siteResource.protocol}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            {siteResource.alias && (
                                                                <div>
                                                                    <span className="font-medium">Alias:</span>
                                                                    <span className="ml-2 text-muted-foreground">
                                                                        {siteResource.alias}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            {siteResource.aliasAddress && (
                                                                <div>
                                                                    <span className="font-medium">Alias Address:</span>
                                                                    <span className="ml-2 text-muted-foreground">
                                                                        {siteResource.aliasAddress}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            <div>
                                                                <span className="font-medium">Status:</span>
                                                                <span className={`ml-2 ${siteResource.enabled ? 'text-green-600' : 'text-red-600'}`}>
                                                                    {siteResource.enabled ? 'Enabled' : 'Disabled'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </InfoPopup>
                                                </div>
                                            </div>

                                            <div className="mt-3">
                                                {siteResource.alias ? (
                                                    <>
                                                        {/* Alias as primary */}
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <div className="text-base font-semibold text-foreground text-left truncate flex-1">
                                                                {siteResource.alias}
                                                            </div>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 text-muted-foreground"
                                                                onClick={() => {
                                                                    navigator.clipboard.writeText(
                                                                        siteResource.alias!
                                                                    );
                                                                    toast({
                                                                        title: "Copied to clipboard",
                                                                        description:
                                                                            "Resource alias has been copied to your clipboard.",
                                                                        duration: 2000
                                                                    });
                                                                }}
                                                            >
                                                                <Copy className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                        {/* Destination as secondary */}
                                                        <div className="text-xs text-muted-foreground truncate">
                                                            {siteResource.destination}
                                                        </div>
                                                    </>
                                                ) : (
                                                    /* Destination as primary when no alias */
                                                    <div className="flex items-center gap-2">
                                                        <div className="text-sm text-muted-foreground font-medium text-left truncate flex-1">
                                                            {siteResource.destination}
                                                        </div>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-muted-foreground"
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(
                                                                    siteResource.destination
                                                                );
                                                                toast({
                                                                    title: "Copied to clipboard",
                                                                    description:
                                                                        "Resource destination has been copied to your clipboard.",
                                                                    duration: 2000
                                                                });
                                                            }}
                                                        >
                                                            <Copy className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="p-6 pt-0 mt-auto">
                                            <div className="flex items-center justify-center py-2 px-4 bg-muted/50 rounded text-sm text-muted-foreground">
                                                <Combine className="h-3.5 w-3.5 mr-2" />
                                                Requires Client Connection
                                            </div>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        </>
                    )}

                    {/* Pagination Controls */}
                    <PaginationControls
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={handlePageChange}
                        totalItems={totalItems}
                        itemsPerPage={itemsPerPage}
                    />
                </>
            )}
        </div>
    );
}
