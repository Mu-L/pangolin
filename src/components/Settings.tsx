import { cn } from "@app/lib/cn";

export function SettingsContainer({ children }: { children: React.ReactNode }) {
    return <div className="space-y-6">{children}</div>;
}

export function SettingsSection({ children }: { children: React.ReactNode }) {
    return (
        <div className="border rounded-lg bg-card p-5 flex flex-col min-h-[200px]">
            {children}
        </div>
    );
}

export function SettingsSectionHeader({
    children
}: {
    children: React.ReactNode;
}) {
    return <div className="text-lg space-y-0.5 pb-6">{children}</div>;
}

export function SettingsSectionForm({
    children,
    className,
    variant = "compact"
}: {
    children: React.ReactNode;
    variant?: "half" | "compact";
    className?: string;
}) {
    return (
        <div
            className={cn(
                variant === "half"
                    ? "max-w-3xl space-y-4"
                    : "max-w-xl space-y-4",
                className
            )}
        >
            {children}
        </div>
    );
}

export function SettingsSectionTitle({
    children
}: {
    children: React.ReactNode;
}) {
    return (
        <h2 className="text-1xl font-semibold tracking-tight flex items-center gap-2">
            {children}
        </h2>
    );
}

export function SettingsSectionDescription({
    children
}: {
    children: React.ReactNode;
}) {
    return <p className="text-muted-foreground text-sm">{children}</p>;
}

export function SettingsSubsectionHeader({
    children,
    className
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return <div className={cn("space-y-0.5", className)}>{children}</div>;
}

export function SettingsSubsectionTitle({
    children,
    className
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <h3 className={cn("text-sm font-semibold", className)}>{children}</h3>
    );
}

export function SettingsSubsectionDescription({
    children,
    className
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <p className={cn("text-sm text-muted-foreground", className)}>
            {children}
        </p>
    );
}

export function SettingsSectionBody({
    children
}: {
    children: React.ReactNode;
}) {
    return <div className="space-y-5 flex-grow">{children}</div>;
}

export function SettingsSectionFooter({
    children,
    className
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "flex flex-col md:flex-row justify-end space-y-2 md:space-y-0 md:space-x-2 mt-auto pt-6",
                className
            )}
        >
            {children}
        </div>
    );
}

export function SettingsSectionGrid({
    children,
    cols
}: {
    children: React.ReactNode;
    cols: number;
}) {
    return <div className={`grid md:grid-cols-${cols} gap-6`}>{children}</div>;
}
