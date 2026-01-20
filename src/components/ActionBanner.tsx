"use client";

import React, { type ReactNode } from "react";
import { Card, CardContent } from "@app/components/ui/card";
import { Button } from "@app/components/ui/button";
import { cn } from "@app/lib/cn";
import { cva, type VariantProps } from "class-variance-authority";

const actionBannerVariants = cva(
    "mb-6 relative overflow-hidden",
    {
        variants: {
            variant: {
                warning: "border-yellow-500/30 bg-gradient-to-br from-yellow-500/10 via-background to-background",
                info: "border-blue-500/30 bg-gradient-to-br from-blue-500/10 via-background to-background",
                success: "border-green-500/30 bg-gradient-to-br from-green-500/10 via-background to-background",
                destructive: "border-red-500/30 bg-gradient-to-br from-red-500/10 via-background to-background",
                default: "border-primary/30 bg-gradient-to-br from-primary/10 via-background to-background"
            }
        },
        defaultVariants: {
            variant: "default"
        }
    }
);

const titleVariants = "text-lg font-semibold flex items-center gap-2";

const iconVariants = cva(
    "w-5 h-5",
    {
        variants: {
            variant: {
                warning: "text-yellow-600 dark:text-yellow-500",
                info: "text-blue-600 dark:text-blue-500",
                success: "text-green-600 dark:text-green-500",
                destructive: "text-red-600 dark:text-red-500",
                default: "text-primary"
            }
        },
        defaultVariants: {
            variant: "default"
        }
    }
);

type ActionBannerProps = {
    title: string;
    titleIcon?: ReactNode;
    description: string;
    actions?: ReactNode;
    className?: string;
} & VariantProps<typeof actionBannerVariants>;

export function ActionBanner({
    title,
    titleIcon,
    description,
    actions,
    variant = "default",
    className
}: ActionBannerProps) {
    return (
        <Card className={cn(actionBannerVariants({ variant }), className)}>
            <CardContent className="p-6">
                <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                    <div className="flex-1 space-y-2 min-w-0">
                        <h3 className={titleVariants}>
                            {titleIcon && (
                                <span className={cn(iconVariants({ variant }))}>
                                    {titleIcon}
                                </span>
                            )}
                            {title}
                        </h3>
                        <p className="text-sm text-muted-foreground max-w-4xl">
                            {description}
                        </p>
                    </div>
                    {actions && (
                        <div className="flex flex-wrap gap-3 lg:shrink-0 lg:justify-end">
                            {actions}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

export default ActionBanner;
