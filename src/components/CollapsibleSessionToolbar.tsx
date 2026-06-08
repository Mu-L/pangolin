"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@app/lib/cn";
import { useTranslations } from "next-intl";

export default function CollapsibleSessionToolbar({
    children,
    defaultOpen = false
}: {
    children: ReactNode;
    defaultOpen?: boolean;
}) {
    const t = useTranslations();
    const [open, setOpen] = useState(defaultOpen);

    return (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10">
            <div
                className={cn(
                    "pointer-events-auto absolute inset-x-0 top-0 bg-black text-white shadow-lg transition-transform duration-200 ease-out",
                    open ? "translate-y-0" : "-translate-y-full"
                )}
            >
                <div className="flex flex-wrap items-center gap-2 p-2">
                    {children}
                </div>
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    aria-label={
                        open ? t("sessionToolbarHide") : t("sessionToolbarShow")
                    }
                    aria-expanded={open}
                    className="absolute left-1/2 top-full flex h-7 w-12 -translate-x-1/2 items-center justify-center rounded-b-md bg-primary text-primary-foreground shadow-md transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                    {open ? (
                        <ChevronUp className="h-4 w-4" />
                    ) : (
                        <ChevronDown className="h-4 w-4" />
                    )}
                </button>
            </div>
        </div>
    );
}
