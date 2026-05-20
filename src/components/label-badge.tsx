import { cn } from "@app/lib/cn";
import { Button } from "./ui/button";

export type LabelBadgeProps = {
    name: string;
    color: string;
    onClick?: () => void;
    className?: string;
};

export function LabelBadge({
    onClick,
    name,
    color,
    className
}: LabelBadgeProps) {
    return (
        <Button
            variant="outline"
            onClick={onClick}
            className={cn(
                "inline-flex gap-1 items-center",
                "rounded-full text-sm cursor-pointer",
                "pl-1.5 pr-2 py-0 h-auto",
                className
            )}
        >
            <div
                className="size-3 rounded-full bg-(--color) flex-none"
                style={{
                    // @ts-expect-error css color
                    "--color": color
                }}
            />
            <span className="whitespace-nowrap text-ellipsis max-w-16 overflow-hidden relative">
                {name}
            </span>
        </Button>
    );
}
