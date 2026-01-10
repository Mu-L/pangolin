"use client";
import { useTranslations } from "next-intl";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { Card, CardHeader } from "./ui/card";
import { Button } from "./ui/button";
import { ArrowRight, Ban, Check, LaptopMinimal, RefreshCw } from "lucide-react";
import { cn } from "@app/lib/cn";
import { Label } from "./ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "./ui/select";
import { approvalFiltersSchema, approvalQueries } from "@app/lib/queries";
import { useQuery } from "@tanstack/react-query";
import { Fragment } from "react";
import { Separator } from "./ui/separator";
import type { ListApprovalsResponse } from "@server/private/routers/approvals";
import Link from "next/link";

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
        approvalQueries.listApprovals(orgId)
    );

    const approvals = data?.approvals ?? [];

    console.log({
        approvals
    });

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
                            value={filters.approvalState ?? "pending"}
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
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="approved">
                                    Approved
                                </SelectItem>
                                <SelectItem value="all">All</SelectItem>
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
                                    <ApprovalRequest approval={approval} />
                                </li>
                                {/* <Separator /> */}
                                {index < approvals.length - 1 && <Separator />}
                                {/* <li>
                                    <ApprovalRequest approval={approval} />
                                </li>
                                <Separator />
                                <li>
                                    <ApprovalRequest approval={approval} />
                                </li> */}
                            </Fragment>
                        ))}
                    </ul>
                </CardHeader>
            </Card>
        </div>
    );
}

type ApprovalRequestProps = {
    approval: ListApprovalsResponse["approvals"][number];
};

function ApprovalRequest({ approval }: ApprovalRequestProps) {
    const t = useTranslations();
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
                <Button
                    onClick={() => {}}
                    className="lg:static gap-2"
                    type="submit"
                >
                    <Check className="size-4 flex-none" />
                    {t("approve")}
                </Button>
                <Button
                    variant="destructive"
                    onClick={() => {}}
                    className="lg:static gap-2"
                    type="submit"
                >
                    <Ban className="size-4 flex-none" />
                    {t("deny")}
                </Button>
                <Button
                    variant="outline"
                    onClick={() => {}}
                    className="lg:static gap-2"
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
