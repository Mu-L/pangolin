"use client";

import React, { useEffect, useRef, useState } from "react";
import { type VariantProps } from "class-variance-authority";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList
} from "@app/components/ui/command";
import {
    Popover,
    PopoverAnchor,
    PopoverContent,
    PopoverTrigger
} from "@app/components/ui/popover";
import { Button } from "@app/components/ui/button";
import { cn } from "@app/lib/cn";
import { tagVariants } from "./tag";
import { TagList } from "./tag-list";
import type { Tag, TagInputStyleClassesProps } from "./tag-input";

export type SuggestionsTagInputProps = {
    tags: Tag[];
    setTags: React.Dispatch<React.SetStateAction<Tag[]>>;
    suggestedOptions: Tag[];
    searchQuery: string;
    onSearchQueryChange: (value: string) => void;
    activeTagIndex: number | null;
    setActiveTagIndex: React.Dispatch<React.SetStateAction<number | null>>;
    placeholder?: string;
    maxTags?: number;
    onTagAdd?: (tag: string) => void;
    onTagRemove?: (tag: string) => void;
    allowDuplicates?: boolean;
    disabled?: boolean;
    usePortal?: boolean;
    styleClasses?: TagInputStyleClassesProps;
} & VariantProps<typeof tagVariants>;

export function SuggestionsTagInput({
    tags,
    setTags,
    suggestedOptions,
    searchQuery,
    onSearchQueryChange,
    activeTagIndex,
    setActiveTagIndex,
    placeholder,
    maxTags,
    onTagAdd,
    onTagRemove,
    allowDuplicates = false,
    disabled = false,
    usePortal = false,
    styleClasses = {},
    variant,
    size,
    shape,
    borderStyle,
    textCase,
    interaction,
    animation,
    textStyle
}: SuggestionsTagInputProps) {
    const t = useTranslations();
    const triggerRef = useRef<HTMLDivElement | null>(null);
    const popoverContentRef = useRef<HTMLDivElement | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [popoverWidth, setPopoverWidth] = useState(0);

    useEffect(() => {
        const handleOutsideClick = (event: MouseEvent | TouchEvent) => {
            if (
                isOpen &&
                triggerRef.current &&
                popoverContentRef.current &&
                !triggerRef.current.contains(event.target as Node) &&
                !popoverContentRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleOutsideClick);
        return () =>
            document.removeEventListener("mousedown", handleOutsideClick);
    }, [isOpen]);

    const handleOpenChange = (open: boolean) => {
        if (open && triggerRef.current) {
            setPopoverWidth(triggerRef.current.getBoundingClientRect().width);
        }
        if (open) setIsOpen(true);
    };

    const toggleTag = (option: Tag) => {
        const index = tags.findIndex((tag) => tag.text === option.text);
        if (index >= 0) {
            setTags(tags.filter((_, i) => i !== index));
            onTagRemove?.(option.text);
        } else {
            if (
                !allowDuplicates &&
                tags.some((tag) => tag.text === option.text)
            )
                return;
            if (!maxTags || tags.length < maxTags) {
                setTags([...tags, option]);
                onTagAdd?.(option.text);
            }
        }
    };

    const removeTag = (idToRemove: string) => {
        const removed = tags.find((tag) => tag.id === idToRemove);
        setTags(tags.filter((tag) => tag.id !== idToRemove));
        if (removed) onTagRemove?.(removed.text);
    };

    const onSortEnd = (oldIndex: number, newIndex: number) => {
        setTags((current) => {
            const next = [...current];
            const [moved] = next.splice(oldIndex, 1);
            next.splice(newIndex, 0, moved);
            return next;
        });
    };

    return (
        <Popover open={isOpen} onOpenChange={handleOpenChange} modal={usePortal}>
            <PopoverAnchor asChild>
                <div
                    ref={triggerRef}
                    className={cn(
                        "flex flex-row flex-wrap items-center gap-1.5 p-1.5 w-full rounded-md border border-input text-sm bg-transparent pr-1",
                        styleClasses?.inlineTagsContainer
                    )}
                >
                    <TagList
                        tags={tags}
                        variant={variant}
                        size={size}
                        shape={shape}
                        borderStyle={borderStyle}
                        textCase={textCase}
                        interaction={interaction}
                        animation={animation}
                        textStyle={textStyle}
                        onRemoveTag={removeTag}
                        onSortEnd={onSortEnd}
                        inlineTags
                        activeTagIndex={activeTagIndex}
                        setActiveTagIndex={setActiveTagIndex}
                        classStyleProps={{
                            tagListClasses: styleClasses?.tagList,
                            tagClasses: styleClasses?.tag
                        }}
                        disabled={disabled}
                    />
                    <PopoverTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            role="combobox"
                            type="button"
                            disabled={
                                disabled ||
                                (maxTags !== undefined &&
                                    tags.length >= maxTags)
                            }
                            className={cn(
                                "hover:bg-transparent ml-auto",
                                styleClasses?.autoComplete?.popoverTrigger
                            )}
                            onClick={() => setIsOpen(!isOpen)}
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="24"
                                height="24"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className={`lucide lucide-chevron-down h-4 w-4 shrink-0 opacity-50 transition-transform ${isOpen ? "rotate-180" : "rotate-0"}`}
                            >
                                <path d="m6 9 6 6 6-6" />
                            </svg>
                        </Button>
                    </PopoverTrigger>
                </div>
            </PopoverAnchor>
            <PopoverContent
                ref={popoverContentRef}
                side="bottom"
                align="start"
                forceMount
                className={cn("p-0", styleClasses?.autoComplete?.popoverContent)}
                style={{
                    width: `${popoverWidth}px`,
                    minWidth: `${popoverWidth}px`,
                    zIndex: 9999
                }}
            >
                <Command
                    shouldFilter={false}
                    className={cn(
                        "rounded-lg border-0 shadow-none",
                        styleClasses?.autoComplete?.command
                    )}
                >
                    <CommandInput
                        placeholder={placeholder ?? t("searchPlaceholder")}
                        className="h-9"
                        value={searchQuery}
                        onValueChange={onSearchQueryChange}
                    />
                    <CommandList
                        className={cn(
                            "max-h-[300px]",
                            styleClasses?.autoComplete?.commandList
                        )}
                    >
                        <CommandEmpty>{t("noResults")}</CommandEmpty>
                        <CommandGroup
                            className={styleClasses?.autoComplete?.commandGroup}
                        >
                            {suggestedOptions.map((option) => {
                                const isChosen = tags.some(
                                    (tag) => tag.text === option.text
                                );
                                return (
                                    <CommandItem
                                        key={option.id}
                                        value={`${option.text} ${option.id}`}
                                        onSelect={() => toggleTag(option)}
                                        className={
                                            styleClasses?.autoComplete
                                                ?.commandItem
                                        }
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-4 w-4 shrink-0",
                                                isChosen
                                                    ? "opacity-100"
                                                    : "opacity-0"
                                            )}
                                        />
                                        {option.text}
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
