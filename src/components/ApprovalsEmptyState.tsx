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
                <CardContent className="p-12">
                    <div className="flex flex-col items-center text-center gap-6 max-w-2xl mx-auto">
                        <div className="rounded-full bg-primary/10 p-4">
                            <ShieldCheck className="w-12 h-12 text-primary" />
                        </div>

                        <div className="space-y-2">
                            <h3 className="text-2xl font-semibold">
                                {t("approvalsEmptyStateTitle")}
                            </h3>
                            <p className="text-muted-foreground text-lg">
                                {t("approvalsEmptyStateDescription")}
                            </p>
                        </div>

                        <div className="w-full space-y-4 mt-4">
                            <div className="bg-muted/50 rounded-lg p-6 space-y-4 border">
                                <div className="flex items-start gap-4">
                                    <div className="rounded-lg bg-background p-3 border">
                                        <Settings className="w-5 h-5 text-primary" />
                                    </div>
                                    <div className="flex-1 text-left">
                                        <h4 className="font-semibold mb-1">
                                            {t("approvalsEmptyStateStep1Title")}
                                        </h4>
                                        <p className="text-sm text-muted-foreground">
                                            {t(
                                                "approvalsEmptyStateStep1Description"
                                            )}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-4">
                                    <div className="rounded-lg bg-background p-3 border">
                                        <User className="w-5 h-5 text-primary" />
                                    </div>
                                    <div className="flex-1 text-left">
                                        <h4 className="font-semibold mb-1">
                                            {t("approvalsEmptyStateStep2Title")}
                                        </h4>
                                        <p className="text-sm text-muted-foreground">
                                            {t(
                                                "approvalsEmptyStateStep2Description"
                                            )}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Abstract UI Preview */}
                            <div className="bg-muted/50 rounded-lg p-6 border">
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

                        <Link href={`/${orgId}/settings/access/roles`}>
                            <Button className="gap-2 mt-2">
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
