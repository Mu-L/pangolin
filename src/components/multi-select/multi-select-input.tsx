import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@app/components/ui/popover";
import { Button } from "@app/components/ui/button";
import { cn } from "@app/lib/cn";
import { ChevronDownIcon } from "lucide-react";
import {
    type TagValue,
    type MultiSelectTagsProps,
    MultiSelectTags
} from "./multi-select-tags";

export interface MultiSelectInputProps<
    T extends TagValue
> extends MultiSelectTagsProps<T> {
    buttonText?: string;
}

export function MultiSelectInput<T extends TagValue>({
    buttonText,
    ...props
}: MultiSelectInputProps<T>) {
    return (
        <Popover>
            <PopoverTrigger>
                <div
                    className={cn(
                        "justify-between w-full",
                        "text-muted-foreground pl-1.5 cursor-text"
                    )}
                >
                    <span
                        className={cn(
                            "inline-flex items-center gap-1",
                            "overflow-x-auto"
                        )}
                    >
                        {/* {(field.value ?? []).map((client) => (
                            <span
                                key={client.clientId}
                                className={cn(
                                    "bg-muted-foreground/20 font-normal text-foreground rounded-sm",
                                    "py-1 px-1.5 text-xs"
                                )}
                            >
                                {client.name}
                            </span>
                        ))} */}
                        <span className="pl-1 font-normal">{buttonText}</span>
                    </span>
                    <ChevronDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </div>
            </PopoverTrigger>
            <PopoverContent className="p-0">
                <MultiSelectTags {...props} />
            </PopoverContent>
        </Popover>
    );
}
