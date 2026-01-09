import { pullEnv } from "@app/lib/pullEnv";
import { build } from "@server/build";
import { redirect } from "next/navigation";

interface LayoutProps {
    children: React.ReactNode;
    params: Promise<{}>;
}

export default async function Layout(props: LayoutProps) {
    const env = pullEnv();

    if (build !== "saas" && !env.flags.useOrgOnlyIdp) {
        redirect("/");
    }

    return props.children;
}
