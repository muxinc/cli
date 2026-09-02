import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  mock,
  spyOn,
  test,
} from 'bun:test';
import type Mux from '@mux/ts';
import type { AnyRobotsJob, RobotsWorkflow } from './_shared.ts';
import {
  assertJobCompleted,
  pollForRobotsJob,
  retrieveRobotsJob,
} from './_shared.ts';

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

function makeMuxStub(statuses: string[]): Mux {
  let call = 0;
  const retrieve = mock(() => {
    const status = statuses[Math.min(call, statuses.length - 1)];
    call++;
    return Promise.resolve({
      ...baseJob,
      id: 'rjob_test123',
      status,
    } as AnyRobotsJob);
  });
  return {
    robots: {
      jobs: { summarize: { retrieve } },
    },
  } as unknown as Mux;
}

describe('retrieveRobotsJob', () => {
  const workflowResources: Array<[RobotsWorkflow, string]> = [
    ['ask-questions', 'askQuestions'],
    ['edit-captions', 'editCaptions'],
    ['find-best-thumbnails', 'findBestThumbnails'],
    ['find-key-moments', 'findKeyMoments'],
    ['find-scenes', 'findScenes'],
    ['generate-chapters', 'generateChapters'],
    ['generate-engagement-insights', 'generateEngagementInsights'],
    ['generate-premium-captions', 'generatePremiumCaptions'],
    ['moderate', 'moderate'],
    ['summarize', 'summarize'],
    ['translate-audio', 'translateAudio'],
    ['translate-captions', 'translateCaptions'],
  ];

  test.each(
    workflowResources,
  )('routes %s to the matching jobs resource', async (workflow, resource) => {
    const retrieve = mock(() =>
      Promise.resolve({ ...baseJob, workflow } as AnyRobotsJob),
    );
    const mux = {
      robots: { jobs: { [resource]: { retrieve } } },
    } as unknown as Mux;

    const job = await retrieveRobotsJob(mux, workflow, 'rjob_test123');

    expect(retrieve).toHaveBeenCalledWith('rjob_test123');
    expect(job.workflow).toBe(workflow);
  });
});

describe('pollForRobotsJob', () => {
  let stderrSpy: Mock<typeof process.stderr.write>;

  beforeEach(() => {
    stderrSpy = spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy?.mockRestore();
  });

  test('returns the job once it reaches a terminal status', async () => {
    const mux = makeMuxStub(['pending', 'processing', 'completed']);

    const job = await pollForRobotsJob(mux, 'summarize', 'rjob_test123', {
      json: true,
      pollIntervalMs: 1,
    });

    expect(job.status).toBe('completed');
  });

  test('in JSON mode, polling is silent so stdout stays a single JSON result', async () => {
    const stdoutSpy = spyOn(process.stdout, 'write').mockImplementation(
      () => true,
    );
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    try {
      const mux = makeMuxStub(['pending', 'processing', 'completed']);
      await pollForRobotsJob(mux, 'summarize', 'rjob_test123', {
        json: true,
        pollIntervalMs: 1,
      });

      expect(stderrSpy).not.toHaveBeenCalled();
      expect(stdoutSpy).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
      logSpy.mockRestore();
    }
  });

  test('in pretty mode, keeps the existing dots progress on stderr', async () => {
    const mux = makeMuxStub(['processing', 'completed']);

    await pollForRobotsJob(mux, 'summarize', 'rjob_test123', {
      json: false,
      pollIntervalMs: 1,
    });

    const output = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('Waiting for job to complete');
    expect(output).toContain('.');
    expect(output).toContain('completed!');
  });

  test('resolves immediately when the job is already terminal', async () => {
    const mux = makeMuxStub(['errored']);

    const job = await pollForRobotsJob(mux, 'summarize', 'rjob_test123', {
      json: true,
      pollIntervalMs: 1,
    });

    expect(job.status).toBe('errored');
    expect(stderrSpy).not.toHaveBeenCalled();
  });
});
