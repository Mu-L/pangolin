"use client";

import { Button } from "@app/components/ui/button";
import { Avatar, AvatarFallback } from "@app/components/ui/avatar";

type UserProfileCardProps = {
    identifier: string;
    description?: string;
    onUseDifferentAccount?: () => void;
    useDifferentAccountText?: string;
};

export default function UserProfileCard({
    identifier,
    description,
    onUseDifferentAccount,
    useDifferentAccountText
}: UserProfileCardProps) {
    // Create profile label and initial from identifier
    const profileLabel = identifier.trim();
    const profileInitial = profileLabel
        ? profileLabel.charAt(0).toUpperCase()
        : "";

    return (
        <div className="flex items-center gap-3 p-3 border rounded-md">
            <Avatar className="h-10 w-10">
                <AvatarFallback>{profileInitial}</AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-1">
                <div>
                    <p className="text-sm font-medium">{profileLabel}</p>
                    {description && (
                        <p className="text-xs text-muted-foreground break-all">
                            {description}
                        </p>
                    )}
                </div>
                {onUseDifferentAccount && (
                    <Button
                        type="button"
                        variant="link"
                        className="h-auto px-0 text-xs"
                        onClick={onUseDifferentAccount}
                    >
                        {useDifferentAccountText || "Use a different account"}
                    </Button>
                )}
            </div>
        </div>
    );
}
