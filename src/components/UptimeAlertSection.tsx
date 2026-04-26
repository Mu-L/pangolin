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
import { PaidFeaturesAlert } from "@app/components/PaidFeaturesAlert";
import { usePaidStatus } from "@app/hooks/usePaidStatus";
import { tierMatrix } from "@server/lib/billing/tierMatrix";
import { useTranslations } from "next-intl";

interface UptimeAlertSectionProps {
    orgId: string;
    siteId?: number;
    startingName?: string;
    resourceId?: number;
    days?: number;
}

export default function UptimeAlertSection({
    orgId,
    siteId,
    startingName,
    resourceId,
    days = 90
}: UptimeAlertSectionProps) {
    const t = useTranslations();
    const api = createApiClient(useEnvContext());
    const queryClient = useQueryClient();
    const { isPaidUser } = usePaidStatus();
    const isPaid = isPaidUser(tierMatrix.alertingRules);

    const [open, setOpen] = useState(false);
    const [name, setName] = useState(
        `${siteId ? t("site") : t("resource")} ${startingName} ${t("alertLabel")}`
    );
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

    const { data: alertRules, isLoading: alertRulesLoading } = useQuery({
        ...orgQueries.alertRulesForSource({ orgId, siteId, resourceId }),
        enabled: isPaid
    });

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
        () => orgRoles.map((r) => ({ id: String(r.roleId), text: r.name })),
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
                title: t("uptimeAlertNoRecipients"),
                description: t("uptimeAlertNoRecipientsDescription")
            });
            return;
        }

        setLoading(true);
        try {
            await api.put(`/org/${orgId}/alert-rule`, {
                name,
                eventType: siteId ? "site_toggle" : "resource_toggle",
                enabled: true,
                cooldownSeconds: 0, // default to 0 here because we dont want the extra confusion
                siteIds: siteId ? [siteId] : [],
                healthCheckIds: [],
                resourceIds: resourceId ? [resourceId] : [],
                userIds: userTags.map((tag) => tag.id),
                roleIds: roleTags.map((tag) => Number(tag.id)),
                emails: emailTags.map((tag) => tag.text),
                webhookActions: []
            });

            toast({
                title: t("uptimeAlertCreated"),
                description: t("uptimeAlertCreatedDescription")
            });

            setOpen(false);
            setName(t("uptimeSectionTitle"));
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
                title: t("uptimeAlertCreateFailed"),
                description: formatAxiosError(e, t("errorOccurred"))
            });
        }
        setLoading(false);
    }

    const rulesListSearch = new URLSearchParams();
    if (siteId != null) rulesListSearch.set("siteId", String(siteId));
    if (resourceId != null)
        rulesListSearch.set("resourceId", String(resourceId));
    const rulesListHref = `/${orgId}/settings/alerting/rules${
        rulesListSearch.toString() ? `?${rulesListSearch}` : ""
    }`;

    const alertButton = alertRulesLoading ? (
        <Button variant="outline" type="button" loading aria-busy="true">
            <BellPlus className="size-4 mr-2" />
            {t("uptimeAddAlert")}
        </Button>
    ) : hasRules ? (
        <Button variant="outline" asChild>
            <Link href={rulesListHref}>
                <BellRing className="size-4 mr-2" />
                {t("uptimeViewAlerts")}
            </Link>
        </Button>
    ) : (
        <Button variant="outline" onClick={() => setOpen(true)}>
            <BellPlus className="size-4 mr-2" />
            {t("uptimeAddAlert")}
        </Button>
    );

    return (
        <>
            <SettingsSection>
                <SettingsSectionHeader>
                    <div className="flex justify-between items-start">
                        <div>
                            <SettingsSectionTitle>
                                {t("uptimeSectionTitle")}
                            </SettingsSectionTitle>
                            <SettingsSectionDescription>
                                {t("uptimeSectionDescription", { days })}
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
                        <CredenzaTitle>
                            {t("uptimeCreateEmailAlert")}
                        </CredenzaTitle>
                        <CredenzaDescription>
                            {siteId
                                ? t("uptimeAlertDescriptionSite")
                                : t("uptimeAlertDescriptionResource")}
                        </CredenzaDescription>
                    </CredenzaHeader>
                    <CredenzaBody>
                        <div className="space-y-4">
                            <PaidFeaturesAlert tiers={tierMatrix.alertingRules} />
                            <fieldset
                                disabled={!isPaid}
                                className={!isPaid ? "opacity-50 pointer-events-none" : ""}
                            >
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="alert-name">
                                            {t("name")}
                                        </Label>
                                        <Input
                                            id="alert-name"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            placeholder={t("uptimeAlertNamePlaceholder")}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>{t("alertingNotifyUsers")}</Label>
                                        <TagInput
                                            activeTagIndex={activeUserTagIndex}
                                            setActiveTagIndex={setActiveUserTagIndex}
                                            placeholder={t("alertingSelectUsers")}
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
                                        <Label>{t("alertingNotifyRoles")}</Label>
                                        <TagInput
                                            activeTagIndex={activeRoleTagIndex}
                                            setActiveTagIndex={setActiveRoleTagIndex}
                                            placeholder={t("alertingSelectRoles")}
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
                                        <Label>{t("uptimeAdditionalEmails")}</Label>
                                        <TagInput
                                            activeTagIndex={activeEmailTagIndex}
                                            setActiveTagIndex={setActiveEmailTagIndex}
                                            placeholder={t("alertingEmailPlaceholder")}
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
                            </fieldset>
                        </div>
                    </CredenzaBody>
                    <CredenzaFooter>
                        <CredenzaClose asChild>
                            <Button variant="outline">{t("cancel")}</Button>
                        </CredenzaClose>
                        <Button
                            onClick={handleSubmit}
                            loading={loading}
                            disabled={loading || !isPaid}
                        >
                            {t("uptimeCreateAlert")}
                        </Button>
                    </CredenzaFooter>
                </CredenzaContent>
            </Credenza>
        </>
    );
}
