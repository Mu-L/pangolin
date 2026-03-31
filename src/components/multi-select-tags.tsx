import type { Ref } from "react";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList
} from "./ui/command";
import { cn } from "@app/lib/cn";
import { CheckIcon } from "lucide-react";

export type TagValue = { text: string; id: string };

export type MultiSelectTagsProps<T extends TagValue> = {
    emptyPlaceholder: string;
    searchPlaceholder: string;
    searchQuery?: string;
    options: Array<T>;
    value: Array<T>;
    onChange: (newValue: Array<T>) => void;
    onSearch: (query: string) => void;
    ref?: Ref<HTMLButtonElement>;
};

export function MultiSelectTags<T extends TagValue>({
    emptyPlaceholder,
    searchPlaceholder,
    searchQuery,
    value,
    options,
    onSearch,
    onChange
}: MultiSelectTagsProps<T>) {
    const selectedValues = new Set(value.map((v) => v.id));
    return (
        <Command shouldFilter={false}>
            <CommandInput
                placeholder={searchPlaceholder}
                value={searchQuery}
                onValueChange={onSearch}
            />
            <CommandList>
                <CommandEmpty>{emptyPlaceholder}</CommandEmpty>
                <CommandGroup>
                    {options.map((option) => (
                        <CommandItem
                            value={option.id}
                            key={option.id}
                            onSelect={() => {
                                let newValues = [];
                                if (selectedValues.has(option.id)) {
                                    newValues = value.filter(
                                        (v) => v.id !== option.id
                                    );
                                } else {
                                    newValues = [...value, option];
                                }
                                onChange(newValues);
                            }}
                        >
                            <CheckIcon
                                className={cn(
                                    "mr-2 h-4 w-4",
                                    selectedValues.has(option.id)
                                        ? "opacity-100"
                                        : "opacity-0"
                                )}
                            />
                            {`${option.text}`}
                        </CommandItem>
                    ))}
                </CommandGroup>
            </CommandList>
        </Command>
    );
}
