/**
 * Pagination helpers.
 *
 * Every list endpoint is paginated. An unpaginated `findMany` works fine
 * against 20 seeded rows and takes the server down at 200,000 — the failure
 * only appears once the data is real, which is the worst time to find it.
 */

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/** Hard ceiling, so a client cannot request ?limit=1000000. */
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

/**
 * Normalises validated query values into Prisma's skip/take.
 *
 * Defensive clamping is retained even though Zod validates upstream: this
 * function is also called from scripts and jobs that never pass through
 * request validation.
 */
export const getPagination = (page = 1, limit = DEFAULT_LIMIT): PaginationParams => {
  const safePage = Math.max(1, Math.trunc(page));
  const safeLimit = Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit)));

  return {
    page: safePage,
    limit: safeLimit,
    skip: (safePage - 1) * safeLimit,
  };
};

/** Builds the meta block returned alongside a paginated list. */
export const buildPaginationMeta = (
  { page, limit }: PaginationParams,
  total: number
): PaginationMeta => {
  const totalPages = Math.ceil(total / limit) || 1;

  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
};
