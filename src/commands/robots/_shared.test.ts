import { describe, expect, test } from 'bun:test';
import type { AnyRobotsJob } from './_shared.ts';
import { assertJobCompleted } from './_shared.ts';

const baseJob = {
  id: 'rjob_xyz',
  workflow: 'summarize',
  created_at: 0,
  updated_at: 0,
  units_consumed: 0,
  parameters: { asset_id: 'asset_x' },
} as unknown as AnyRobotsJob;

describe('assertJobCompleted', () => {
  test('returns silently on status=completed', () => {
    expect(() =>
      assertJobCompleted({ ...baseJob, status: 'completed' } as AnyRobotsJob),
    ).not.toThrow();
  });

  test('throws on status=errored', () => {
    expect(() =>
      assertJobCompleted({ ...baseJob, status: 'errored' } as AnyRobotsJob),
    ).toThrow(/errored/i);
  });

  test('throws on status=cancelled', () => {
    expect(() =>
      assertJobCompleted({ ...baseJob, status: 'cancelled' } as AnyRobotsJob),
    ).toThrow(/cancelled/i);
  });

  test('includes job.errors details when present', () => {
    const job = {
      ...baseJob,
      status: 'errored',
      errors: [
        { type: 'processing_error', message: 'asset not ready' },
        { type: 'timeout', message: 'took too long' },
      ],
    } as unknown as AnyRobotsJob;
    expect(() => assertJobCompleted(job)).toThrow(
      /processing_error: asset not ready.*timeout: took too long/,
    );
  });

  test('includes job id in the error message', () => {
    expect(() =>
      assertJobCompleted({
        ...baseJob,
        id: 'rjob_abc123',
        status: 'errored',
      } as AnyRobotsJob),
    ).toThrow(/rjob_abc123/);
  });
});
