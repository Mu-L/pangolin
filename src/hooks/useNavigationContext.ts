import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

export function useNavigationContext() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const path = usePathname();
    const [isNavigating, startTransition] = useTransition();

    function navigate({
        searchParams: params,
        pathname = path,
        replace = false
    }: {
        pathname?: string;
        searchParams?: URLSearchParams;
        replace?: boolean;
    }) {
        startTransition(() => {
            const fullPath = pathname + (params ? `?${params.toString()}` : "");

            if (replace) {
                router.replace(fullPath);
            } else {
                router.push(fullPath);
            }
        });
    }

    return {
        pathname: path,
        searchParams: new URLSearchParams(searchParams), // we want the search params to be writeable
        navigate,
        isNavigating
    };
}
