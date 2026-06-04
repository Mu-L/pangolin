import { buttonVariants } from "@app/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@app/components/ui/popover";
import { cn } from "@app/lib/cn";
import { ChevronDownIcon, LockIcon, XIcon } from "lucide-react";
import {
    type MultiSelectTagsProps,
    type TagValue,
    MultiSelectContent
} from "./multi-select-content";

export interface MultiSelectInputProps<
    T extends TagValue
> extends MultiSelectTagsProps<T> {
    buttonText?: string;
    lockedIds?: Set<string>;
}

export function MultiSelectTagInput<T extends TagValue>({
    buttonText,
    lockedIds,
    ...props
}: MultiSelectInputProps<T>) {
    const selectedValues = new Set(props.value.map((v) => v.id));

    return (
        <Popover
            onOpenChange={(open) => {
                if (!open) {
                    // clear input when popover is closed
                    props.onSearch("");
                }
            }}
        >
            <PopoverTrigger asChild>
                <div
                    role="combobox"
                    className={cn(
                        buttonVariants({
                            variant: "outline"
                        }),
                        "justify-between w-full inline-flex",
                        "text-muted-foreground pl-1.5 cursor-text h-9 py-0",
                        "hover:bg-transparent hover:text-muted-foreground",
                        props.disabled && "pointer-events-none opacity-50"
                    )}
                >
                    <span
                        className={cn(
                            "inline-flex items-center gap-1 min-w-0 flex-1",
                            "overflow-x-auto flex-nowrap h-full"
                        )}
                    >
                        {props.value.map((option) => {
                            const isLocked = lockedIds?.has(option.id);
                            return (
                                <span
                                    key={option.id}
                                    className={cn(
                                        "bg-muted-foreground/10 font-normal text-foreground rounded-sm flex-none",
                                        "py-0.5 pl-1.5 pr-0.5 text-xs inline-flex items-center gap-0.5",
                                        isLocked && "opacity-60"
                                    )}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <span className="max-w-40 text-ellipsis overflow-hidden">
                                        {option.text}
                                    </span>
                                    {isLocked ? (
                                        <span className="p-0.5 flex-none">
                                            <LockIcon className="size-3" />
                                        </span>
                                    ) : (
                                        <button
                                            className="p-0.5 flex-none cursor-pointer"
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                let newValues = [];
                                                if (
                                                    selectedValues.has(
                                                        option.id
                                                    )
                                                ) {
                                                    newValues =
                                                        props.value.filter(
                                                            (v) =>
                                                                v.id !==
                                                                option.id
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
                                    )}
                                </span>
                            );
                        })}
                        <span className="pl-1 font-normal">{buttonText}</span>
                    </span>
                    <ChevronDownIcon className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
            </PopoverTrigger>
            <PopoverContent className="p-0">
                <MultiSelectContent {...props} lockedIds={lockedIds} />
            </PopoverContent>
        </Popover>
    );
}
