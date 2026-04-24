import { orgQueries } from "@app/lib/queries";
import type { ListClientsResponse } from "@server/routers/client";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useDebounce } from "use-debounce";

import { useTranslations } from "next-intl";
import { MultiSelectTags } from "./multi-select/multi-select-tags";
import { TagInput, type TagInputProps } from "./tags/tag-input";

export type SelectedMachine = Pick<
    ListClientsResponse["clients"][number],
    "name" | "clientId"
>;

export type MachineSelectorProps = {
    orgId: string;
    selectedMachines?: SelectedMachine[];
    onSelectMachines: (machine: SelectedMachine[]) => void;
} & Omit<
    TagInputProps,
    | "activeTagIndex"
    | "setActiveTagIndex"
    | "placeholder"
    | "size"
    | "tags"
    | "setTags"
    | "value"
    | "searchQuery"
    | "onSearchQueryChange"
    | "suggestedOptions"
    | "enableAutocomplete"
    | "autocompleteOptions"
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

    // always include the selected machines in the list of machines shown (if the user isn't searching)
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

    // const selectedMachinesIds = new Set(
    //     selectedMachines.map((m) => m.clientId)
    // );

    const [activeTagIndex, setActiveTagIndex] = useState<number | null>(null);

    return (
        <>
            <TagInput
                {...props}
                activeTagIndex={activeTagIndex}
                setActiveTagIndex={setActiveTagIndex}
                placeholder={t("accessClientSelect")}
                size="sm"
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
                restrictTagsToAutocompleteOptions
                sortTags
            />
        </>
        //    <MultiSelectTags
        //         emptyPlaceholder={t("machineNotFound")}
        //         searchPlaceholder={t("machineSearch")}
        //         value={selectedMachines.map((m) => ({
        //             ...m,
        //             text: m.name,
        //             id: m.clientId.toString()
        //         }))}
        //         onChange={(values) => {
        //             onSelectMachines(values);
        //         }}
        //         options={machinesShown.map((m) => ({
        //             ...m,
        //             id: m.clientId.toString(),
        //             text: m.name
        //         }))}
        //         onSearch={setMachineSearchQuery}
        //         searchQuery={machineSearchQuery}
        //     />

        // <Command shouldFilter={false}>
        //     <CommandInput
        //         placeholder={t("machineSearch")}
        //         value={machineSearchQuery}
        //         onValueChange={setMachineSearchQuery}
        //     />
        //     <CommandList>
        //         <CommandEmpty>{t("machineNotFound")}</CommandEmpty>
        //         <CommandGroup>
        //             {machinesShown.map((m) => (
        //                 <CommandItem
        //                     value={`${m.name}:${m.clientId}`}
        //                     key={m.clientId}
        //                     onSelect={() => {
        //                         let newMachineClients = [];
        //                         if (selectedMachinesIds.has(m.clientId)) {
        //                             newMachineClients = selectedMachines.filter(
        //                                 (mc) => mc.clientId !== m.clientId
        //                             );
        //                         } else {
        //                             newMachineClients = [
        //                                 ...selectedMachines,
        //                                 m
        //                             ];
        //                         }
        //                         onSelectMachines(newMachineClients);
        //                     }}
        //                 >
        //                     <CheckIcon
        //                         className={cn(
        //                             "mr-2 h-4 w-4",
        //                             selectedMachinesIds.has(m.clientId)
        //                                 ? "opacity-100"
        //                                 : "opacity-0"
        //                         )}
        //                     />
        //                     {`${m.name}`}
        //                 </CommandItem>
        //             ))}
        //         </CommandGroup>
        //     </CommandList>
        // </Command>
    );
}
