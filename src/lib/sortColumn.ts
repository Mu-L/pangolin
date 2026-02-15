import type { SortOrder } from "@app/lib/types/sort";

export function getNextSortOrder(
    column: string,
    searchParams: URLSearchParams
) {
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

    return sp;
}

export function getSortDirection(
    column: string,
    searchParams: URLSearchParams
) {
    let currentDirection: SortOrder = "indeterminate";

    if (searchParams.get("sort_by") === column) {
        currentDirection =
            (searchParams.get("order") as SortOrder) ?? "indeterminate";
    }
    return currentDirection;
}
