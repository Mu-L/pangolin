"use client";

import { useEffect, useState } from "react";
import {
    SettingsContainer,
    SettingsSection,
    SettingsSectionBody,
    SettingsSectionDescription,
    SettingsSectionFooter,
    SettingsSectionHeader,
    SettingsSectionTitle
} from "@app/components/Settings";
import { Button } from "@app/components/ui/button";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { toast } from "@app/hooks/useToast";
import { useParams } from "next/navigation";
import { AxiosResponse } from "axios";
import { useRemoteExitNodeContext } from "@app/hooks/useRemoteExitNodeContext";
import { TagInput, type Tag } from "@app/components/tags/tag-input";
import type { ListRemoteExitNodeResourcesResponse } from "@server/private/routers/remoteExitNode/listRemoteExitNodeResources";
import type { SetRemoteExitNodeResourcesResponse } from "@server/private/routers/remoteExitNode/setRemoteExitNodeResources";

const cidrRegex =
    /^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\/([0-9]|[1-2][0-9]|3[0-2]))$|^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]+|::(ffff(:0{1,4})?:)?((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9]))(\/([0-9]|[1-9][0-9]|1[0-1][0-9]|12[0-8]))$/;

export default function NetworkingPage() {
    const { env } = useEnvContext();
    const api = createApiClient({ env });
    const { orgId } = useParams<{
        orgId: string;
        remoteExitNodeId: string;
    }>();
    const { remoteExitNode } = useRemoteExitNodeContext();

    const [subnets, setSubnets] = useState<Tag[]>([]);
    const [activeTagIndex, setActiveTagIndex] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        async function loadResources() {
            try {
                const res = await api.get<
                    AxiosResponse<ListRemoteExitNodeResourcesResponse>
                >(
                    `/org/${orgId}/remote-exit-node/${remoteExitNode.remoteExitNodeId}/resources`
                );
                const resources = res.data.data.resources;
                setSubnets(
                    resources.map((r) => ({
                        id: r.destination,
                        text: r.destination
                    }))
                );
            } catch (error) {
                toast({
                    variant: "destructive",
                    title: "Error",
                    description:
                        formatAxiosError(error) || "Failed to load subnets"
                });
            } finally {
                setLoading(false);
            }
        }

        loadResources();
    }, [remoteExitNode.remoteExitNodeId]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.post<AxiosResponse<SetRemoteExitNodeResourcesResponse>>(
                `/org/${orgId}/remote-exit-node/${remoteExitNode.remoteExitNodeId}/resources`,
                {
                    destinations: subnets.map((s) => s.text)
                }
            );
            toast({
                title: "Subnets saved",
                description: "Remote subnets have been updated successfully."
            });
        } catch (error) {
            toast({
                variant: "destructive",
                title: "Error",
                description: formatAxiosError(error) || "Failed to save subnets"
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <SettingsContainer>
            <SettingsSection>
                <SettingsSectionHeader>
                    <SettingsSectionTitle>Remote Subnets</SettingsSectionTitle>
                    <SettingsSectionDescription>
                        Define the CIDR ranges that this remote exit node will
                        route traffic to. Type a valid CIDR (e.g.{" "}
                        <code>10.0.0.0/8</code>) and press Enter to add.
                    </SettingsSectionDescription>
                </SettingsSectionHeader>
                <SettingsSectionBody>
                    <TagInput
                        tags={subnets}
                        setTags={setSubnets}
                        placeholder="Add a CIDR range (e.g. 10.0.0.0/8)"
                        validateTag={(tag) => cidrRegex.test(tag.trim())}
                        activeTagIndex={activeTagIndex}
                        setActiveTagIndex={setActiveTagIndex}
                        disabled={loading}
                        allowDuplicates={false}
                        inlineTags={true}
                    />
                </SettingsSectionBody>
                <SettingsSectionFooter>
                    <Button onClick={handleSave} loading={saving}>
                        Save Subnets
                    </Button>
                </SettingsSectionFooter>
            </SettingsSection>
        </SettingsContainer>
    );
}
