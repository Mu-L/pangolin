"use client";

import { useEffect, useMemo, useState } from "react";
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
import { MultiSelectTagInput } from "@app/components/multi-select/multi-select-tag-input";
import type { TagValue } from "@app/components/multi-select/multi-select-content";
import { orgQueries } from "@app/lib/queries";
import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "use-debounce";
import type { ListRemoteExitNodeResourcesResponse } from "@server/private/routers/remoteExitNode/listRemoteExitNodeResources";
import type { SetRemoteExitNodeResourcesResponse } from "@server/private/routers/remoteExitNode/setRemoteExitNodeResources";
import type { ListRemoteExitNodePreferenceLabelsResponse } from "@server/private/routers/remoteExitNode/listRemoteExitNodePreferenceLabels";
import type { SetRemoteExitNodePreferenceLabelsResponse } from "@server/private/routers/remoteExitNode/setRemoteExitNodePreferenceLabels";

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

    // Subnets state
    const [subnets, setSubnets] = useState<Tag[]>([]);
    const [activeTagIndex, setActiveTagIndex] = useState<number | null>(null);
    const [loadingSubnets, setLoadingSubnets] = useState(true);
    const [savingSubnets, setSavingSubnets] = useState(false);

    // Labels state
    const [selectedLabels, setSelectedLabels] = useState<TagValue[]>([]);
    const [labelSearchQuery, setLabelSearchQuery] = useState("");
    const [loadingLabels, setLoadingLabels] = useState(true);
    const [savingLabels, setSavingLabels] = useState(false);

    const [debouncedLabelQuery] = useDebounce(labelSearchQuery, 150);

    const { data: availableLabels = [] } = useQuery(
        orgQueries.labels({ orgId, query: debouncedLabelQuery, perPage: 10 })
    );

    const labelsShown = useMemo<TagValue[]>(() => {
        const base: TagValue[] = availableLabels.map((l) => ({
            id: l.labelId.toString(),
            text: l.name,
            color: l.color
        }));
        if (debouncedLabelQuery.trim().length === 0) {
            for (const sel of selectedLabels) {
                if (!base.find((b) => b.id === sel.id)) {
                    base.unshift(sel);
                }
            }
        }
        return base;
    }, [availableLabels, selectedLabels, debouncedLabelQuery]);

    useEffect(() => {
        async function loadSubnets() {
            try {
                const res = await api.get<
                    AxiosResponse<ListRemoteExitNodeResourcesResponse>
                >(
                    `/org/${orgId}/remote-exit-node/${remoteExitNode.remoteExitNodeId}/resources`
                );
                setSubnets(
                    res.data.data.resources.map((r) => ({
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
                setLoadingSubnets(false);
            }
        }

        async function loadLabels() {
            try {
                const res = await api.get<
                    AxiosResponse<ListRemoteExitNodePreferenceLabelsResponse>
                >(
                    `/org/${orgId}/remote-exit-node/${remoteExitNode.remoteExitNodeId}/preference-labels`
                );
                setSelectedLabels(
                    res.data.data.labels.map((l) => ({
                        id: l.labelId.toString(),
                        text: l.name,
                        color: l.color
                    }))
                );
            } catch (error) {
                toast({
                    variant: "destructive",
                    title: "Error",
                    description:
                        formatAxiosError(error) || "Failed to load labels"
                });
            } finally {
                setLoadingLabels(false);
            }
        }

        loadSubnets();
        loadLabels();
    }, [remoteExitNode.remoteExitNodeId]);

    const handleSaveSubnets = async () => {
        setSavingSubnets(true);
        try {
            await api.post<AxiosResponse<SetRemoteExitNodeResourcesResponse>>(
                `/org/${orgId}/remote-exit-node/${remoteExitNode.remoteExitNodeId}/resources`,
                { destinations: subnets.map((s) => s.text) }
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
            setSavingSubnets(false);
        }
    };

    const handleSaveLabels = async () => {
        setSavingLabels(true);
        try {
            await api.post<
                AxiosResponse<SetRemoteExitNodePreferenceLabelsResponse>
            >(
                `/org/${orgId}/remote-exit-node/${remoteExitNode.remoteExitNodeId}/preference-labels`,
                { labelIds: selectedLabels.map((l) => parseInt(l.id)) }
            );
            toast({
                title: "Labels saved",
                description: "Preference labels have been updated successfully."
            });
        } catch (error) {
            toast({
                variant: "destructive",
                title: "Error",
                description: formatAxiosError(error) || "Failed to save labels"
            });
        } finally {
            setSavingLabels(false);
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
                        disabled={loadingSubnets}
                        allowDuplicates={false}
                        inlineTags={true}
                    />
                </SettingsSectionBody>
                <SettingsSectionFooter>
                    <Button onClick={handleSaveSubnets} loading={savingSubnets}>
                        Save Subnets
                    </Button>
                </SettingsSectionFooter>
            </SettingsSection>

            <SettingsSection>
                <SettingsSectionHeader>
                    <SettingsSectionTitle>
                        Preference Labels
                    </SettingsSectionTitle>
                    <SettingsSectionDescription>
                        Sites with these labels will be enforced to connect
                        through this remote exit node.
                    </SettingsSectionDescription>
                </SettingsSectionHeader>
                <SettingsSectionBody>
                    <MultiSelectTagInput
                        value={selectedLabels}
                        options={labelsShown}
                        onChange={setSelectedLabels}
                        onSearch={setLabelSearchQuery}
                        searchQuery={labelSearchQuery}
                        disabled={loadingLabels}
                        buttonText="Select labels..."
                        searchPlaceholder="Search labels..."
                    />
                </SettingsSectionBody>
                <SettingsSectionFooter>
                    <Button onClick={handleSaveLabels} loading={savingLabels}>
                        Save Labels
                    </Button>
                </SettingsSectionFooter>
            </SettingsSection>
        </SettingsContainer>
    );
}
