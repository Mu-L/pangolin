"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { BellPlus, BellRing } from "lucide-react";
import {
    SettingsSection,
    SettingsSectionHeader,
    SettingsSectionTitle,
    SettingsSectionDescription,
    SettingsSectionBody
} from "@app/components/Settings";
import UptimeBar from "@app/components/UptimeBar";
import { Button } from "@app/components/ui/button";
import {
    Credenza,
    CredenzaBody,
    CredenzaClose,
    CredenzaContent,
    CredenzaDescription,
    CredenzaFooter,
    CredenzaHeader,
    CredenzaTitle
} from "@app/components/Credenza";
import { Input } from "@app/components/ui/input";
import { Label } from "@app/components/ui/label";
import { TagInput, type Tag } from "@app/components/tags/tag-input";
import { getUserDisplayName } from "@app/lib/getUserDisplayName";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { toast } from "@app/hooks/useToast";
import { orgQueries } from "@app/lib/queries";

interface UptimeAlertSectionProps {
    orgId: string;
    siteId?: number;
    resourceId?: number;
    days?: number;
}

export default function UptimeAlertSection({
    orgId,
    siteId,
    resourceId,
    days = 90
}: UptimeAlertSectionProps) {
    const api = createApiClient(useEnvContext());
    const queryClient = useQueryClient();

    const [open, setOpen] = useState(false);
    const [name, setName] = useState("Uptime Alert");
    const [userTags, setUserTags] = useState<Tag[]>([]);
    const [roleTags, setRoleTags] = useState<Tag[]>([]);
    const [emailTags, setEmailTags] = useState<Tag[]>([]);
    const [activeUserTagIndex, setActiveUserTagIndex] = useState<number | null>(
        null
    );
    const [activeRoleTagIndex, setActiveRoleTagIndex] = useState<number | null>(
        null
    );
    const [activeEmailTagIndex, setActiveEmailTagIndex] = useState<
        number | null
    >(null);
    const [loading, setLoading] = useState(false);

    const { data: alertRules, isLoading: alertRulesLoading } = useQuery(
        orgQueries.alertRulesForSource({ orgId, siteId, resourceId })
    );

    const { data: orgUsers = [] } = useQuery(orgQueries.users({ orgId }));
    const { data: orgRoles = [] } = useQuery(orgQueries.roles({ orgId }));

    const allUsers = useMemo(
        () =>
            orgUsers.map((u) => ({
                id: String(u.id),
                text: getUserDisplayName({
                    email: u.email,
                    name: u.name,
                    username: u.username
                })
            })),
        [orgUsers]
    );

    const allRoles = useMemo(
        () =>
            orgRoles
                .map((r) => ({ id: String(r.roleId), text: r.name }))
                .filter((r) => r.text !== "Admin"),
        [orgRoles]
    );

    const hasRules = (alertRules?.length ?? 0) > 0;

    async function handleSubmit() {
        if (
            userTags.length === 0 &&
            roleTags.length === 0 &&
            emailTags.length === 0
        ) {
            toast({
                variant: "destructive",
                title: "No recipients",
                description:
                    "Please add at least one user, role, or email to notify."
            });
            return;
        }

        setLoading(true);
        try {
            await api.put(`/org/${orgId}/alert-rule`, {
                name,
                eventType: siteId ? "site_toggle" : "resource_toggle",
                enabled: true,
                cooldownSeconds: 300,
                siteIds: siteId ? [siteId] : [],
                healthCheckIds: [],
                resourceIds: resourceId ? [resourceId] : [],
                userIds: userTags.map((tag) => tag.id),
                roleIds: roleTags.map((tag) => Number(tag.id)),
                emails: emailTags.map((tag) => tag.text),
                webhookActions: []
            });

            toast({
                title: "Alert created",
                description:
                    "You will be notified when this changes status."
            });

            setOpen(false);
            setName("Uptime Alert");
            setUserTags([]);
            setRoleTags([]);
            setEmailTags([]);

            queryClient.invalidateQueries({
                queryKey: orgQueries.alertRulesForSource({
                    orgId,
                    siteId,
                    resourceId
                }).queryKey
            });
        } catch (e) {
            toast({
                variant: "destructive",
                title: "Failed to create alert",
                description: formatAxiosError(e, "An error occurred.")
            });
        }
        setLoading(false);
    }

    const alertButton = alertRulesLoading ? null : hasRules ? (
        <Button variant="outline" size="sm" asChild>
            <Link href={`/${orgId}/settings/alerting`}>
                <BellRing className="size-4 mr-2" />
                View Alerts
            </Link>
        </Button>
    ) : (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            <BellPlus className="size-4 mr-2" />
            Add Alert
        </Button>
    );

    return (
        <>
            <SettingsSection>
                <SettingsSectionHeader>
                    <div className="flex justify-between items-start">
                        <div>
                            <SettingsSectionTitle>Uptime</SettingsSectionTitle>
                            <SettingsSectionDescription>
                                Site availability over the last {days} days.
                            </SettingsSectionDescription>
                        </div>
                        {alertButton}
                    </div>
                </SettingsSectionHeader>
                <SettingsSectionBody>
                    <UptimeBar
                        siteId={siteId}
                        resourceId={resourceId}
                        days={days}
                    />
                </SettingsSectionBody>
            </SettingsSection>

            <Credenza open={open} onOpenChange={setOpen}>
                <CredenzaContent>
                    <CredenzaHeader>
                        <CredenzaTitle>Create Email Alert</CredenzaTitle>
                        <CredenzaDescription>
                            Get notified by email when this{" "}
                            {siteId ? "site" : "resource"} goes offline or
                            comes back online.
                        </CredenzaDescription>
                    </CredenzaHeader>
                    <CredenzaBody>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="alert-name">Name</Label>
                                <Input
                                    id="alert-name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Alert name"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Notify Users</Label>
                                <TagInput
                                    activeTagIndex={activeUserTagIndex}
                                    setActiveTagIndex={setActiveUserTagIndex}
                                    placeholder="Select users..."
                                    size="sm"
                                    tags={userTags}
                                    setTags={(newTags) => {
                                        const next =
                                            typeof newTags === "function"
                                                ? newTags(userTags)
                                                : newTags;
                                        setUserTags(next as Tag[]);
                                    }}
                                    enableAutocomplete
                                    autocompleteOptions={allUsers}
                                    restrictTagsToAutocompleteOptions
                                    allowDuplicates={false}
                                    sortTags
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Notify Roles</Label>
                                <TagInput
                                    activeTagIndex={activeRoleTagIndex}
                                    setActiveTagIndex={setActiveRoleTagIndex}
                                    placeholder="Select roles..."
                                    size="sm"
                                    tags={roleTags}
                                    setTags={(newTags) => {
                                        const next =
                                            typeof newTags === "function"
                                                ? newTags(roleTags)
                                                : newTags;
                                        setRoleTags(next as Tag[]);
                                    }}
                                    enableAutocomplete
                                    autocompleteOptions={allRoles}
                                    restrictTagsToAutocompleteOptions
                                    allowDuplicates={false}
                                    sortTags
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Additional Emails</Label>
                                <TagInput
                                    activeTagIndex={activeEmailTagIndex}
                                    setActiveTagIndex={setActiveEmailTagIndex}
                                    placeholder="Enter email addresses..."
                                    size="sm"
                                    tags={emailTags}
                                    setTags={(newTags) => {
                                        const next =
                                            typeof newTags === "function"
                                                ? newTags(emailTags)
                                                : newTags;
                                        setEmailTags(next as Tag[]);
                                    }}
                                    allowDuplicates={false}
                                    sortTags
                                    validateTag={(tag) =>
                                        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tag)
                                    }
                                    delimiterList={[",", "Enter"]}
                                />
                            </div>
                        </div>
                    </CredenzaBody>
                    <CredenzaFooter>
                        <CredenzaClose asChild>
                            <Button variant="outline">Cancel</Button>
                        </CredenzaClose>
                        <Button
                            onClick={handleSubmit}
                            loading={loading}
                            disabled={loading}
                        >
                            Create Alert
                        </Button>
                    </CredenzaFooter>
                </CredenzaContent>
            </Credenza>
        </>
    );
}