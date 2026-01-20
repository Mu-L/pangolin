"use client";

import { Button } from "@app/components/ui/button";
import { Card, CardContent } from "@app/components/ui/card";
import {
    ShieldCheck,
    Check,
    Ban,
    User,
    Settings,
    ArrowRight
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

type ApprovalsEmptyStateProps = {
    orgId: string;
};

export function ApprovalsEmptyState({ orgId }: ApprovalsEmptyStateProps) {
    const t = useTranslations();

    return (
        <div className="flex flex-col gap-6">
            <Card>
                <CardContent className="p-6 md:p-12">
                    <div className="flex flex-col items-center text-center gap-4 md:gap-6 max-w-2xl mx-auto">
                        <div className="space-y-2">
                            <h3 className="text-xl md:text-2xl font-semibold">
                                {t("approvalsEmptyStateTitle")}
                            </h3>
                            <p className="text-muted-foreground text-sm md:text-lg">
                                {t("approvalsEmptyStateDescription")}
                            </p>
                        </div>

                        <div className="w-full space-y-3 md:space-y-4 mt-2 md:mt-4">
                            <div className="bg-muted/50 rounded-lg p-4 md:p-6 space-y-3 md:space-y-4 border">
                                <div className="flex items-start gap-3 md:gap-4">
                                    <div className="rounded-lg bg-background p-2 md:p-3 border shrink-0">
                                        <Settings className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                                    </div>
                                    <div className="flex-1 text-left min-w-0">
                                        <h4 className="font-semibold mb-1 text-sm md:text-base">
                                            {t("approvalsEmptyStateStep1Title")}
                                        </h4>
                                        <p className="text-xs md:text-sm text-muted-foreground">
                                            {t(
                                                "approvalsEmptyStateStep1Description"
                                            )}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3 md:gap-4">
                                    <div className="rounded-lg bg-background p-2 md:p-3 border shrink-0">
                                        <User className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                                    </div>
                                    <div className="flex-1 text-left min-w-0">
                                        <h4 className="font-semibold mb-1 text-sm md:text-base">
                                            {t("approvalsEmptyStateStep2Title")}
                                        </h4>
                                        <p className="text-xs md:text-sm text-muted-foreground">
                                            {t(
                                                "approvalsEmptyStateStep2Description"
                                            )}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Abstract UI Preview - Hidden on mobile */}
                            <div className="hidden md:block bg-muted/50 rounded-lg p-6 border">
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between p-3 bg-background rounded border">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                                <User className="w-4 h-4 text-primary" />
                                            </div>
                                            <div>
                                                <div className="h-3 w-24 bg-muted-foreground/20 rounded mb-1"></div>
                                                <div className="h-2 w-32 bg-muted-foreground/10 rounded"></div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <div className="h-6 w-16 bg-muted-foreground/10 rounded"></div>
                                            <div className="h-6 w-16 bg-muted-foreground/10 rounded"></div>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between p-3 bg-background rounded border">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                                <User className="w-4 h-4 text-primary" />
                                            </div>
                                            <div>
                                                <div className="h-3 w-24 bg-muted-foreground/20 rounded mb-1"></div>
                                                <div className="h-2 w-32 bg-muted-foreground/10 rounded"></div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <div className="h-6 w-16 bg-green-500/20 rounded flex items-center justify-center">
                                                <Check className="w-3 h-3 text-green-600" />
                                            </div>
                                            <div className="h-6 w-16 bg-muted-foreground/10 rounded"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <Link href={`/${orgId}/settings/access/roles`} className="w-full md:w-auto">
                            <Button className="gap-2 mt-2 w-full md:w-auto">
                                {t("approvalsEmptyStateButtonText")}
                                <ArrowRight className="w-4 h-4" />
                            </Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
