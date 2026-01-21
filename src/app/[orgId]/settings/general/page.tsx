"use client";
import ConfirmDeleteDialog from "@app/components/ConfirmDeleteDialog";
import { Button } from "@app/components/ui/button";
import { useOrgContext } from "@app/hooks/useOrgContext";
import { toast } from "@app/hooks/useToast";
import {
    useState,
    useTransition,
    useActionState
} from "react";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createApiClient } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { formatAxiosError } from "@app/lib/api";
import { AxiosResponse } from "axios";
import { DeleteOrgResponse, ListUserOrgsResponse } from "@server/routers/org";
import { useRouter } from "next/navigation";
import {
    SettingsContainer,
    SettingsSection,
    SettingsSectionHeader,
    SettingsSectionTitle,
    SettingsSectionDescription,
    SettingsSectionBody,
    SettingsSectionForm,
    SettingsSectionFooter
} from "@app/components/Settings";
import { useUserContext } from "@app/hooks/useUserContext";
import { useTranslations } from "next-intl";
import { build } from "@server/build";
import type { OrgContextType } from "@app/contexts/orgContext";

// Schema for general organization settings
const GeneralFormSchema = z.object({
    name: z.string(),
    subnet: z.string().optional()
});

export default function GeneralPage() {
    const { org } = useOrgContext();
    return (
        <SettingsContainer>
            <GeneralSectionForm org={org.org} />
            {build !== "saas" && <DeleteForm org={org.org} />}
        </SettingsContainer>
    );
}

type SectionFormProps = {
    org: OrgContextType["org"]["org"];
};

function DeleteForm({ org }: SectionFormProps) {
    const t = useTranslations();
    const api = createApiClient(useEnvContext());

    const router = useRouter();
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [loadingDelete, startTransition] = useTransition();
    const { user } = useUserContext();

    async function pickNewOrgAndNavigate() {
        try {
            const res = await api.get<AxiosResponse<ListUserOrgsResponse>>(
                `/user/${user.userId}/orgs`
            );

            if (res.status === 200) {
                if (res.data.data.orgs.length > 0) {
                    const orgId = res.data.data.orgs[0].orgId;
                    // go to `/${orgId}/settings`);
                    router.push(`/${orgId}/settings`);
                } else {
                    // go to `/setup`
                    router.push("/setup");
                }
            }
        } catch (err) {
            console.error(err);
            toast({
                variant: "destructive",
                title: t("orgErrorFetch"),
                description: formatAxiosError(err, t("orgErrorFetchMessage"))
            });
        }
    }
    async function deleteOrg() {
        try {
            const res = await api.delete<AxiosResponse<DeleteOrgResponse>>(
                `/org/${org.orgId}`
            );
            toast({
                title: t("orgDeleted"),
                description: t("orgDeletedMessage")
            });
            if (res.status === 200) {
                pickNewOrgAndNavigate();
            }
        } catch (err) {
            console.error(err);
            toast({
                variant: "destructive",
                title: t("orgErrorDelete"),
                description: formatAxiosError(err, t("orgErrorDeleteMessage"))
            });
        }
    }
    return (
        <>
            <ConfirmDeleteDialog
                open={isDeleteModalOpen}
                setOpen={(val) => {
                    setIsDeleteModalOpen(val);
                }}
                dialog={
                    <div className="space-y-2">
                        <p>{t("orgQuestionRemove")}</p>
                        <p>{t("orgMessageRemove")}</p>
                    </div>
                }
                buttonText={t("orgDeleteConfirm")}
                onConfirm={async () => startTransition(deleteOrg)}
                string={org.name || ""}
                title={t("orgDelete")}
            />
            <SettingsSection>
                <SettingsSectionHeader>
                    <SettingsSectionTitle>
                        {t("dangerSection")}
                    </SettingsSectionTitle>
                    <SettingsSectionDescription>
                        {t("dangerSectionDescription")}
                    </SettingsSectionDescription>
                </SettingsSectionHeader>
                <SettingsSectionFooter>
                    <Button
                        variant="destructive"
                        onClick={() => setIsDeleteModalOpen(true)}
                        className="flex items-center gap-2"
                        loading={loadingDelete}
                        disabled={loadingDelete}
                    >
                        {t("orgDelete")}
                    </Button>
                </SettingsSectionFooter>
            </SettingsSection>
        </>
    );
}

function GeneralSectionForm({ org }: SectionFormProps) {
    const { updateOrg } = useOrgContext();
    const form = useForm({
        resolver: zodResolver(
            GeneralFormSchema.pick({
                name: true,
                subnet: true
            })
        ),
        defaultValues: {
            name: org.name,
            subnet: org.subnet || "" // Add default value for subnet
        },
        mode: "onChange"
    });
    const t = useTranslations();
    const router = useRouter();

    const [, formAction, loadingSave] = useActionState(performSave, null);
    const api = createApiClient(useEnvContext());

    async function performSave() {
        const isValid = await form.trigger();
        if (!isValid) return;

        const data = form.getValues();

        try {
            const reqData = {
                name: data.name
            } as any;

            // Update organization
            await api.post(`/org/${org.orgId}`, reqData);

            // Update the org context to reflect the change in the info card
            updateOrg({
                name: data.name
            });

            toast({
                title: t("orgUpdated"),
                description: t("orgUpdatedDescription")
            });
            router.refresh();
        } catch (e) {
            toast({
                variant: "destructive",
                title: t("orgErrorUpdate"),
                description: formatAxiosError(e, t("orgErrorUpdateMessage"))
            });
        }
    }

    return (
        <SettingsSection>
            <SettingsSectionHeader>
                <SettingsSectionTitle>{t("general")}</SettingsSectionTitle>
                <SettingsSectionDescription>
                    {t("orgGeneralSettingsDescription")}
                </SettingsSectionDescription>
            </SettingsSectionHeader>
            <SettingsSectionBody>
                <SettingsSectionForm>
                    <Form {...form}>
                        <form
                            action={formAction}
                            className="grid gap-4"
                            id="org-general-settings-form"
                        >
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t("name")}</FormLabel>
                                        <FormControl>
                                            <Input {...field} />
                                        </FormControl>
                                        <FormMessage />
                                        <FormDescription>
                                            {t("orgDisplayName")}
                                        </FormDescription>
                                    </FormItem>
                                )}
                            />
                        </form>
                    </Form>
                </SettingsSectionForm>
            </SettingsSectionBody>

            <div className="flex justify-end gap-2 mt-4">
                <Button
                    type="submit"
                    form="org-general-settings-form"
                    loading={loadingSave}
                    disabled={loadingSave}
                >
                    {t("saveSettings")}
                </Button>
            </div>
        </SettingsSection>
    );
}
