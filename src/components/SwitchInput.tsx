import React from "react";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { Button } from "@/components/ui/button";
import { Info } from "lucide-react";
import { info } from "winston";
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@/components/ui/popover";

interface SwitchComponentProps {
    id: string;
    label?: string;
    description?: string;
    info?: string;
    checked?: boolean;
    defaultChecked?: boolean;
    disabled?: boolean;
    onCheckedChange: (checked: boolean) => void;
}

export function SwitchInput({
    id,
    label,
    description,
    info,
    disabled,
    checked,
    defaultChecked = false,
    onCheckedChange
}: SwitchComponentProps) {
    const defaultTrigger = (
        <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-full p-0"
        >
            <Info className="h-4 w-4" />
            <span className="sr-only">Show info</span>
        </Button>
    );

    return (
        <div>
            <div className="flex items-center space-x-2 mb-2">
                <Switch
                    id={id}
                    checked={checked}
                    defaultChecked={defaultChecked}
                    onCheckedChange={onCheckedChange}
                    disabled={disabled}
                />
                {label && <Label htmlFor={id}>{label}</Label>}
                {info && (
                    <Popover>
                        <PopoverTrigger asChild>
                            {defaultTrigger}
                        </PopoverTrigger>
                        <PopoverContent className="w-80">
                            {info && (
                                <p className="text-sm text-muted-foreground">
                                    {info}
                                </p>
                            )}
                        </PopoverContent>
                    </Popover>
                )}
            </div>
            {description && (
                <span className="text-muted-foreground text-sm">
                    {description}
                </span>
            )}
        </div>
    );
}
