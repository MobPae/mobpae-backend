import { getPagination } from './pagination.util';

describe('getPagination', () => {
  it('applies defaults when page/limit are absent', () => {
    expect(getPagination({})).toEqual({ page: 1, limit: 20, skip: 0, take: 20 });
  });

  it('clamps limit to 100 and page to a minimum of 1', () => {
    expect(getPagination({ page: 0, limit: 500 } as any)).toEqual({
      page: 1,
      limit: 100,
      skip: 0,
      take: 100,
    });
  });

  it('falls back to defaults instead of NaN for non-numeric page/limit', () => {
    expect(getPagination({ page: 'abc', limit: 'xyz' } as any)).toEqual({
      page: 1,
      limit: 20,
      skip: 0,
      take: 20,
    });
  });
});
