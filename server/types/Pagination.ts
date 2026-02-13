export type Pagination = { total: number; pageSize: number; page: number };

export type PaginatedResponse<T> = T & {
    pagination: Pagination;
};
