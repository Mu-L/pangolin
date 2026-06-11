"use client";

import { Button } from "@app/components/ui/button";
import { CommandShortcut } from "@app/components/ui/command";
import { cn } from "@app/lib/cn";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useCommandPalette } from "./CommandPalette";

type CommandPaletteTriggerProps = {
    variant?: "header" | "mobile";
    className?: string;
};

function useIsMac() {
    const [isMac, setIsMac] = useState(false);

    useEffect(() => {
        setIsMac(/Mac|iPhone|iPod|iPad/.test(navigator.platform));
    }, []);

    return isMac;
}

export function CommandPaletteTrigger({
    variant = "header",
    className
}: CommandPaletteTriggerProps) {
    const t = useTranslations();
    const { setOpen } = useCommandPalette();
    const isMac = useIsMac();

    if (variant === "mobile") {
        return (
            <Button
                variant="ghost"
                size="icon"
                className={className}
                aria-label={t("commandPaletteTitle")}
                onClick={() => setOpen(true)}
            >
                <Search className="size-5" />
            </Button>
        );
    }

    return (
        <Button
            variant="outline"
            className={cn(
                "hidden h-9 w-56 justify-start gap-2 px-3 text-muted-foreground md:flex lg:w-64",
                className
            )}
            aria-label={t("commandPaletteTitle")}
            onClick={() => setOpen(true)}
        >
            <Search className="size-4 shrink-0 opacity-50" />
            <span className="flex-1 truncate text-left text-sm font-normal">
                {t("commandPaletteSearchPlaceholder")}
            </span>
            <CommandShortcut>
                {isMac
                    ? t("commandPaletteShortcutMac")
                    : t("commandPaletteShortcutWindows")}
            </CommandShortcut>
        </Button>
    );
}
