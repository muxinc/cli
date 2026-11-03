import { describe, expect, test } from 'bun:test';
import { RequestBucket } from './rate-limit.ts';

function fakeTime() {
  let now = 0;
  const sleeps: number[] = [];
  return {
    now: () => now,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      now += ms;
    },
    sleeps,
    elapsed: () => now,
  };
}

describe('RequestBucket', () => {
  test('allows a burst up to its capacity without waiting', async () => {
    const time = fakeTime();
    const bucket = new RequestBucket({ capacity: 4, perSecond: 1, ...time });

    for (let i = 0; i < 4; i++) await bucket.take();

    expect(time.elapsed()).toBe(0);
  });

  test('then paces requests at the refill rate', async () => {
    const time = fakeTime();
    const bucket = new RequestBucket({ capacity: 4, perSecond: 1, ...time });

    for (let i = 0; i < 10; i++) await bucket.take();

    expect(time.elapsed()).toBe(6000);
  });

  test('refills while idle, up to its capacity', async () => {
    const time = fakeTime();
    const bucket = new RequestBucket({ capacity: 4, perSecond: 1, ...time });
    for (let i = 0; i < 4; i++) await bucket.take();

    await time.sleep(60_000);
    const before = time.elapsed();
    for (let i = 0; i < 4; i++) await bucket.take();

    expect(time.elapsed()).toBe(before);
  });

  test('serves concurrent callers one token each', async () => {
    const time = fakeTime();
    const bucket = new RequestBucket({ capacity: 1, perSecond: 2, ...time });

    await Promise.all([bucket.take(), bucket.take(), bucket.take()]);

    expect(time.elapsed()).toBe(1000);
  });
});
