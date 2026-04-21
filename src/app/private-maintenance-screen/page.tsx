import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle
} from "@app/components/ui/card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Private Placeholder"
};

export default async function MaintenanceScreen() {
    const t = await getTranslations();

    let title = t("privateMaintenanceScreenTitle");
    let message = t("privateMaintenanceScreenMessage");

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>{title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">{message}</CardContent>
            </Card>
        </div>
    );
}
