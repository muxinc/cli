import { describe, expect, it } from 'bun:test';
import { AbstractPage } from '@mux/ts/core/pagination';
import { formatJson, unwrapPage } from './json-output.ts';

/**
 * Build an object that is a real AbstractPage instance (via prototype) with
 * the same enumerable own properties the SDK assigns in its constructor.
 */
function makePage(body: unknown): AbstractPage<unknown> {
  const page = Object.create(AbstractPage.prototype);
  page.options = {
    method: 'get',
    path: '/video/v1/assets',
    query: { limit: 25, page: 1 },
  };
  page.response = {};
  page.body = body;
  // Page subclasses mirror body fields onto the instance
  if (body && typeof body === 'object') {
    Object.assign(page, body);
  }
  return page;
}

describe('unwrapPage', () => {
  it('returns the raw API response body for SDK page objects', () => {
    const body = { data: [{ id: 'abc' }], next_cursor: 'cursor123' };
    expect(unwrapPage(makePage(body))).toBe(body);
  });

  it('preserves non-cursor pagination fields carried in the body', () => {
    const body = {
      data: [{ value: 1 }],
      total_row_count: 1,
      timeframe: [100, 200],
      limit: 25,
    };
    expect(unwrapPage(makePage(body))).toBe(body);
  });

  it('returns plain objects unchanged', () => {
    const plain = { data: [], timeframe: [1, 2], total_row_count: 0 };
    expect(unwrapPage(plain)).toBe(plain);
  });

  it('returns arrays unchanged', () => {
    const arr = [{ id: 'a' }];
    expect(unwrapPage(arr)).toBe(arr);
  });

  it('returns null and undefined unchanged', () => {
    expect(unwrapPage(null)).toBe(null);
    expect(unwrapPage(undefined)).toBe(undefined);
  });
});

describe('formatJson', () => {
  it('serializes only the body of a page, excluding SDK internals', () => {
    const body = { data: [{ id: 'abc' }], next_cursor: null };
    const parsed = JSON.parse(formatJson(makePage(body)));
    expect(parsed).toEqual(body);
    expect(Object.keys(parsed).sort()).toEqual(['data', 'next_cursor']);
  });

  it('serializes plain responses as-is with 2-space indentation', () => {
    const plain = { data: [1, 2] };
    expect(formatJson(plain)).toBe(JSON.stringify(plain, null, 2));
  });
});
