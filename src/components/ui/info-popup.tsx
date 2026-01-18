"use client";

import React, { useState, useRef, useEffect } from "react";
import { Info } from "lucide-react";
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

interface InfoPopupProps {
    text?: string;
    info?: string;
    trigger?: React.ReactNode;
    children?: React.ReactNode;
}

export function InfoPopup({ text, info, trigger, children }: InfoPopupProps) {
    const [open, setOpen] = useState(false);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleMouseEnter = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        setOpen(true);
    };

    const handleMouseLeave = () => {
        // Add a small delay to prevent flickering when moving between trigger and content
        timeoutRef.current = setTimeout(() => {
            setOpen(false);
        }, 100);
    };

    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    const defaultTrigger = (
        <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-full p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
        >
            <Info className="h-4 w-4" />
            <span className="sr-only">Show info</span>
        </Button>
    );

    const triggerElement = trigger ?? defaultTrigger;

    return (
        <div className="flex items-center space-x-2">
            {text && <span>{text}</span>}
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger
                    asChild
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                >
                    {triggerElement}
                </PopoverTrigger>
                <PopoverContent
                    className="w-80"
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                >
                    {children ||
                        (info && (
                            <p className="text-sm text-muted-foreground">
                                {info}
                            </p>
                        ))}
                </PopoverContent>
            </Popover>
        </div>
    );
}
