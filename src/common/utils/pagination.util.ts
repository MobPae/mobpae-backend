import { ListQueryDto } from '../dto/list-query.dto';

export type PaginatedResponse<T> = {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export function getPagination(query: ListQueryDto) {
  const page = Math.max(Number(query.page ?? 1), 1);
  const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 100);

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    take: limit,
  };
}

export function paginate<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResponse<T> {
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export function getOrderBy(
  query: ListQueryDto,
  allowedSortFields: string[],
  fallbackSortBy = 'createdAt',
) {
  const sortBy = allowedSortFields.includes(query.sortBy ?? '')
    ? query.sortBy!
    : fallbackSortBy;

  return {
    [sortBy]: query.sortOrder ?? 'desc',
  };
}

export function hasSearch(query: ListQueryDto) {
  return Boolean(query.search?.trim());
}

export function containsSearch(query: ListQueryDto) {
  return {
    contains: query.search?.trim(),
    mode: 'insensitive' as const,
  };
}
