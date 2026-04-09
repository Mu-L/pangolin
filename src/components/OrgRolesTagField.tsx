"use client";

import {
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@app/components/ui/form";
import { Tag, TagInput } from "@app/components/tags/tag-input";
import { toast } from "@app/hooks/useToast";
import { useTranslations } from "next-intl";
import type { Dispatch, SetStateAction } from "react";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";

export type RoleTag = {
    id: string;
    text: string;
};

type OrgRolesTagFieldProps<TFieldValues extends FieldValues> = {
    form: Pick<UseFormReturn<TFieldValues>, "control" | "getValues" | "setValue">;
    /** Field in the form that holds Tag[] (role tags). Default: `"roles"`. */
    name?: Path<TFieldValues>;
    label: string;
    placeholder: string;
    allRoleOptions: Tag[];
    supportsMultipleRolesPerUser: boolean;
    showMultiRolePaywallMessage: boolean;
    paywallMessage: string;
    loading?: boolean;
    activeTagIndex: number | null;
    setActiveTagIndex: Dispatch<SetStateAction<number | null>>;
};

export default function OrgRolesTagField<TFieldValues extends FieldValues>({
    form,
    name = "roles" as Path<TFieldValues>,
    label,
    placeholder,
    allRoleOptions,
    supportsMultipleRolesPerUser,
    showMultiRolePaywallMessage,
    paywallMessage,
    loading = false,
    activeTagIndex,
    setActiveTagIndex
}: OrgRolesTagFieldProps<TFieldValues>) {
    const t = useTranslations();

    function setRoleTags(updater: Tag[] | ((prev: Tag[]) => Tag[])) {
        const prev = form.getValues(name) as Tag[];
        const nextValue =
            typeof updater === "function" ? updater(prev) : updater;
        const next = supportsMultipleRolesPerUser
            ? nextValue
            : nextValue.length > 1
              ? [nextValue[nextValue.length - 1]]
              : nextValue;

        if (
            !supportsMultipleRolesPerUser &&
            next.length === 0 &&
            prev.length > 0
        ) {
            form.setValue(name, [prev[prev.length - 1]] as never, {
                shouldDirty: true
            });
            return;
        }

        if (next.length === 0) {
            toast({
                variant: "destructive",
                title: t("accessRoleErrorAdd"),
                description: t("accessRoleSelectPlease")
            });
            return;
        }

        form.setValue(name, next as never, { shouldDirty: true });
    }

    return (
        <FormField
            control={form.control}
            name={name}
            render={({ field }) => (
                <FormItem className="flex flex-col items-start">
                    <FormLabel>{label}</FormLabel>
                    <FormControl>
                        <TagInput
                            {...field}
                            activeTagIndex={activeTagIndex}
                            setActiveTagIndex={setActiveTagIndex}
                            placeholder={placeholder}
                            size="sm"
                            tags={field.value}
                            setTags={setRoleTags}
                            enableAutocomplete={true}
                            autocompleteOptions={allRoleOptions}
                            allowDuplicates={false}
                            restrictTagsToAutocompleteOptions={true}
                            sortTags={true}
                            disabled={loading}
                        />
                    </FormControl>
                    {showMultiRolePaywallMessage && (
                        <FormDescription>{paywallMessage}</FormDescription>
                    )}
                    <FormMessage />
                </FormItem>
            )}
        />
    );
}
