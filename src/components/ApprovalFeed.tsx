"use client";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { toast } from "@app/hooks/useToast";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { cn } from "@app/lib/cn";
import { approvalFiltersSchema, approvalQueries } from "@app/lib/queries";
import type {
    ListApprovalsResponse,
    ProcessApprovalResponse
} from "@server/private/routers/approvals";
import { useQuery } from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import { ArrowRight, Ban, Check, LaptopMinimal, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useActionState } from "react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardHeader } from "./ui/card";
import { Label } from "./ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "./ui/select";
import { Separator } from "./ui/separator";

export type ApprovalFeedProps = {
    orgId: string;
};

export function ApprovalFeed({ orgId }: ApprovalFeedProps) {
    const searchParams = useSearchParams();
    const path = usePathname();
    const t = useTranslations();

    const router = useRouter();

    const filters = approvalFiltersSchema.parse(
        Object.fromEntries(searchParams.entries())
    );

    const { data, isFetching, refetch } = useQuery(
        approvalQueries.listApprovals(orgId, filters)
    );

    const approvals = data?.approvals ?? [];

    return (
        <div className="flex flex-col gap-5">
            <Card className="">
                <CardHeader className="flex flex-col sm:flex-row sm:items-end lg:items-end gap-2 ">
                    <div className="flex flex-col items-start gap-2 w-48 mb-0">
                        <Label htmlFor="approvalState">
                            {t("filterByApprovalState")}
                        </Label>
                        <Select
                            onValueChange={(newValue) => {
                                const newSearch = new URLSearchParams(
                                    searchParams
                                );
                                newSearch.set("approvalState", newValue);

                                router.replace(
                                    `${path}?${newSearch.toString()}`
                                );
                            }}
                            value={filters.approvalState ?? "all"}
                        >
                            <SelectTrigger
                                id="approvalState"
                                className="w-full"
                            >
                                <SelectValue
                                    placeholder={t("selectApprovalState")}
                                />
                            </SelectTrigger>
                            <SelectContent className="w-full">
                                <SelectItem value="pending">
                                    {t("pending")}
                                </SelectItem>
                                <SelectItem value="approved">
                                    {t("approved")}
                                </SelectItem>
                                <SelectItem value="denied">
                                    {t("denied")}
                                </SelectItem>
                                <SelectItem value="all">{t("all")}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <Button
                        variant="outline"
                        onClick={() => {
                            refetch();
                        }}
                        disabled={isFetching}
                        className="lg:static gap-2"
                    >
                        <RefreshCw
                            className={cn(
                                "size-4",
                                isFetching && "animate-spin"
                            )}
                        />
                        {t("refresh")}
                    </Button>
                </CardHeader>
            </Card>
            <Card>
                <CardHeader>
                    <ul className="flex flex-col gap-4">
                        {approvals.map((approval, index) => (
                            <Fragment key={approval.approvalId}>
                                <li>
                                    <ApprovalRequest
                                        approval={approval}
                                        orgId={orgId}
                                        onSuccess={() => refetch()}
                                    />
                                </li>
                                {index < approvals.length - 1 && <Separator />}
                            </Fragment>
                        ))}

                        {approvals.length === 0 && (
                            <li className="flex justify-center items-center p-4 text-muted-foreground">
                                {t("approvalListEmpty")}
                            </li>
                        )}
                    </ul>
                </CardHeader>
            </Card>
        </div>
    );
}

type ApprovalRequestProps = {
    approval: ListApprovalsResponse["approvals"][number];
    orgId: string;
    onSuccess?: (data: ProcessApprovalResponse) => void;
};

function ApprovalRequest({ approval, orgId, onSuccess }: ApprovalRequestProps) {
    const t = useTranslations();

    const [_, formAction, isSubmitting] = useActionState(onSubmit, null);
    const api = createApiClient(useEnvContext());

    async function onSubmit(_previousState: any, formData: FormData) {
        const decision = formData.get("decision");
        const res = await api
            .put<
                AxiosResponse<ProcessApprovalResponse>
            >(`/org/${orgId}/approvals/${approval.approvalId}`, { decision })
            .catch((e) => {
                toast({
                    variant: "destructive",
                    title: t("accessApprovalErrorUpdate"),
                    description: formatAxiosError(
                        e,
                        t("accessApprovalErrorUpdateDescription")
                    )
                });
            });
        if (res && res.status === 200) {
            const result = res.data.data;
            toast({
                variant: "default",
                title: t("accessApprovalUpdated"),
                description:
                    result.decision === "approved"
                        ? t("accessApprovalApprovedDescription")
                        : t("accessApprovalDeniedDescription")
            });

            onSuccess?.(res.data.data);
        }
    }

    return (
        <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="inline-flex items-start md:items-center gap-2">
                <LaptopMinimal className="size-4 text-muted-foreground flex-none relative top-2 sm:top-0" />
                <span>
                    <span className="text-primary">
                        {approval.user.username}
                    </span>
                    &nbsp;
                    {approval.type === "user_device" && (
                        <span>{t("requestingNewDeviceApproval")}</span>
                    )}
                </span>
            </div>
            <div className="inline-flex gap-2">
                {approval.decision === "pending" && (
                    <form action={formAction} className="inline-flex gap-2">
                        <Button
                            value="approved"
                            name="decision"
                            className="gap-2"
                            type="submit"
                            loading={isSubmitting}
                        >
                            <Check className="size-4 flex-none" />
                            {t("approve")}
                        </Button>
                        <Button
                            value="denied"
                            name="decision"
                            variant="destructive"
                            className="gap-2"
                            type="submit"
                            loading={isSubmitting}
                        >
                            <Ban className="size-4 flex-none" />
                            {t("deny")}
                        </Button>
                    </form>
                )}
                {approval.decision === "approved" && (
                    <Badge variant="green">{t("approved")}</Badge>
                )}
                {approval.decision === "denied" && (
                    <Badge variant="red">{t("denied")}</Badge>
                )}

                <Button
                    variant="outline"
                    onClick={() => {}}
                    className="gap-2"
                    asChild
                >
                    <Link href={"#"}>
                        {t("viewDetails")}
                        <ArrowRight className="size-4 flex-none" />
                    </Link>
                </Button>
            </div>
        </div>
    );
}
