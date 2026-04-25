import { orgQueries } from "@app/lib/queries";
import type { ListClientsResponse } from "@server/routers/client";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useDebounce } from "use-debounce";

import { useTranslations } from "next-intl";
import {
    SuggestionsTagInput,
    type SuggestionsTagInputProps
} from "./tags/suggestions-tag-input";

export type SelectedMachine = Pick<
    ListClientsResponse["clients"][number],
    "name" | "clientId"
>;

export type MachineSelectorProps = {
    orgId: string;
    selectedMachines?: SelectedMachine[];
    onSelectMachines: (machine: SelectedMachine[]) => void;
} & Omit<
    SuggestionsTagInputProps,
    | "tags"
    | "setTags"
    | "suggestedOptions"
    | "searchQuery"
    | "onSearchQueryChange"
    | "activeTagIndex"
    | "setActiveTagIndex"
>;

export function MachinesSelector({
    orgId,
    selectedMachines = [],
    onSelectMachines,
    ...props
}: MachineSelectorProps) {
    const t = useTranslations();
    const [machineSearchQuery, setMachineSearchQuery] = useState("");

    const [debouncedValue] = useDebounce(machineSearchQuery, 150);

    const { data: machines = [] } = useQuery(
        orgQueries.machineClients({ orgId, perPage: 3, query: debouncedValue })
    );

    // always include the selected machines in the list (if the user isn't searching)
    const machinesShown = useMemo(() => {
        const allMachines: Array<SelectedMachine> = [...machines];
        if (debouncedValue.trim().length === 0) {
            for (const machine of selectedMachines) {
                if (
                    !allMachines.find((mc) => mc.clientId === machine.clientId)
                ) {
                    allMachines.unshift(machine);
                }
            }
        }
        return allMachines;
    }, [machines, selectedMachines, debouncedValue]);

    const [activeTagIndex, setActiveTagIndex] = useState<number | null>(null);

    return (
        <SuggestionsTagInput
            {...props}
            activeTagIndex={activeTagIndex}
            setActiveTagIndex={setActiveTagIndex}
            placeholder={t("accessClientSelect")}
            tags={selectedMachines.map((mc) => ({
                id: mc.clientId.toString(),
                text: mc.name
            }))}
            setTags={(newTags) => {
                const tags =
                    typeof newTags === "function"
                        ? newTags(
                              selectedMachines.map((mc) => ({
                                  id: mc.clientId.toString(),
                                  text: mc.name
                              }))
                          )
                        : newTags;
                onSelectMachines(
                    tags.map((tag) => ({
                        clientId: Number(tag.id),
                        name: tag.text
                    }))
                );
            }}
            searchQuery={machineSearchQuery}
            onSearchQueryChange={setMachineSearchQuery}
            suggestedOptions={machinesShown.map((mc) => ({
                id: mc.clientId.toString(),
                text: mc.name
            }))}
            allowDuplicates={false}
        />
    );
}
