import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@app/components/ui/popover";
import { Button, buttonVariants } from "@app/components/ui/button";
import { cn } from "@app/lib/cn";
import { ChevronDownIcon, XIcon } from "lucide-react";
import {
    type TagValue,
    type MultiSelectTagsProps,
    MultiSelectTags
} from "./multi-select-tags";
import { useState } from "react";

export interface MultiSelectInputProps<
    T extends TagValue
> extends MultiSelectTagsProps<T> {
    buttonText?: string;
}

export function MultiSelectInput<T extends TagValue>({
    buttonText,
    ...props
}: MultiSelectInputProps<T>) {
    const selectedValues = new Set(props.value.map((v) => v.id));

    return (
        <Popover>
            <PopoverTrigger asChild>
                <div
                    role="combobox"
                    className={cn(
                        buttonVariants({
                            variant: "outline"
                        }),
                        "justify-between w-full inline-flex",
                        "text-muted-foreground pl-1.5 cursor-text",
                        "hover:bg-transparent hover:text-muted-foreground"
                    )}
                >
                    <span
                        className={cn(
                            "inline-flex items-center gap-1",
                            "overflow-x-auto"
                        )}
                    >
                        {props.value.map((option) => (
                            <span
                                key={option.id}
                                className={cn(
                                    "bg-muted-foreground/20 font-normal text-foreground rounded-sm",
                                    "py-1 pl-1.5 pr-0.5 text-xs inline-flex items-center gap-0.5"
                                )}
                                onClick={(e) => e.stopPropagation()}
                            >
                                {option.text}
                                <button
                                    className="p-0.5 flex-none cursor-pointer"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        let newValues = [];
                                        if (selectedValues.has(option.id)) {
                                            newValues = props.value.filter(
                                                (v) => v.id !== option.id
                                            );
                                        } else {
                                            newValues = [
                                                ...props.value,
                                                option
                                            ];
                                        }
                                        props.onChange(newValues);
                                    }}
                                >
                                    <XIcon className="size-3.5" />
                                </button>
                            </span>
                        ))}
                        <span className="pl-1 font-normal">{buttonText}</span>
                    </span>
                    <ChevronDownIcon className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
            </PopoverTrigger>
            <PopoverContent className="p-0">
                <MultiSelectTags {...props} />
            </PopoverContent>
        </Popover>
    );
}
