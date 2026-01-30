import type { SortOrder } from "@app/lib/types/sort";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { startTransition } from "react";

export function useSortColumn() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const toggleSorting = (column: string) => {
        const sp = new URLSearchParams(searchParams);

        let nextDirection: SortOrder = "indeterminate";

        if (sp.get("sort_by") === column) {
            nextDirection = (sp.get("order") as SortOrder) ?? "indeterminate";
        }

        switch (nextDirection) {
            case "indeterminate": {
                nextDirection = "asc";
                break;
            }
            case "asc": {
                nextDirection = "desc";
                break;
            }
            default: {
                nextDirection = "indeterminate";
                break;
            }
        }

        sp.delete("sort_by");
        sp.delete("order");

        if (nextDirection !== "indeterminate") {
            sp.set("sort_by", column);
            sp.set("order", nextDirection);
        }

        startTransition(() => router.push(`${pathname}?${sp.toString()}`));
    };

    function getSortDirection(column: string) {
        let currentDirection: SortOrder = "indeterminate";

        if (searchParams.get("sort_by") === column) {
            currentDirection =
                (searchParams.get("order") as SortOrder) ?? "indeterminate";
        }
        return currentDirection;
    }

    return [getSortDirection, toggleSorting] as const;
}
