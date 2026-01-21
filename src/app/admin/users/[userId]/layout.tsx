import { internal } from "@app/lib/api";
import { AxiosResponse } from "axios";
import { redirect } from "next/navigation";
import { authCookieHeader } from "@app/lib/api/cookies";
import { getUserDisplayName } from "@app/lib/getUserDisplayName";
import { AdminGetUserResponse } from "@server/routers/user/adminGetUser";
import { HorizontalTabs } from "@app/components/HorizontalTabs";
import { cache } from "react";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import { getTranslations } from "next-intl/server";

interface UserLayoutProps {
    children: React.ReactNode;
    params: Promise<{ userId: string }>;
}

export default async function UserLayoutProps(props: UserLayoutProps) {
    const params = await props.params;

    const { children } = props;

    const t = await getTranslations();

    let user = null;
    try {
        const getUser = cache(async () =>
            internal.get<AxiosResponse<AdminGetUserResponse>>(
                `/user/${params.userId}`,
                await authCookieHeader()
            )
        );
        const res = await getUser();
        user = res.data.data;
    } catch {
        redirect(`/admin/users`);
    }

    const navItems = [
        {
            title: t("general"),
            href: "/admin/users/{userId}/general"
        }
    ];

    return (
        <>
            <SettingsSectionTitle
                title={
                    user
                        ? getUserDisplayName({
                              email: user.email,
                              name: user.name,
                              username: user.username
                          })
                        : ""
                }
                description={t("userDescription2")}
            />
            <HorizontalTabs items={navItems}>{children}</HorizontalTabs>
        </>
    );
}
