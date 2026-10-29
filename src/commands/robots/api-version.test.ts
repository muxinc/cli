import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Mux from '@mux/ts';
import * as auth from '@/lib/mux.ts';
import {
  loadJobParameters,
  type RobotsWorkflow,
  retrieveRobotsJob,
} from './_shared.ts';
import { analyzeStructureCommand } from './analyze-structure.ts';
import { editCaptionsCommand } from './edit-captions.ts';
import { findKeyMomentsCommand } from './find-key-moments.ts';
import { generatePremiumCaptionsCommand } from './generate-premium-captions.ts';
import { translateAudioCommand } from './translate-audio.ts';
import { translateCaptionsCommand } from './translate-captions.ts';

describe('Robots API version', () => {
  const workflows: RobotsWorkflow[] = [
    'ask-questions',
    'edit-captions',
    'find-best-thumbnails',
    'find-key-moments',
    'analyze-structure',
    'generate-chapters',
    'generate-engagement-insights',
    'generate-premium-captions',
    'moderate',
    'summarize',
    'translate-audio',
    'translate-captions',
  ];

  function createClient() {
    const requests: Request[] = [];
    const client = new Mux({
      tokenId: 'test-token',
      tokenSecret: 'test-secret',
      authorizationToken: null,
      fetch: async (input, init) => {
        requests.push(
          input instanceof Request
            ? new Request(input, init)
            : new Request(String(input), init),
        );
        return Response.json({ data: { id: 'rjob_test', status: 'pending' } });
      },
    });
    return { client, requests };
  }

  test.each(workflows)('retrieves %s jobs through v1', async (workflow) => {
    const { client, requests } = createClient();

    await retrieveRobotsJob(client, workflow, 'rjob_test');

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('GET');
    expect(new URL(requests[0]?.url ?? '').pathname).toBe(
      `/robots/v1/jobs/${workflow}/rjob_test`,
    );
  });

  test('creates, lists, and cancels jobs through v1', async () => {
    const { client, requests } = createClient();

    await client.robots.jobs.summarize.create({
      parameters: { asset_id: 'asset_test' },
    });
    await client.robots.jobs.list();
    await client.robots.jobs.cancel('rjob_test');

    expect(
      requests.map((request) => [
        request.method,
        new URL(request.url).pathname,
      ]),
    ).toEqual([
      ['POST', '/robots/v1/jobs/summarize'],
      ['GET', '/robots/v1/jobs'],
      ['POST', '/robots/v1/jobs/rjob_test/cancel'],
    ]);
  });

  const examples = [
    {
      name: 'translate audio',
      command: translateAudioCommand,
      args: ['--to-language-code', 'es'],
      parameters: { output_language_code: 'es' },
    },
    {
      name: 'translate captions',
      command: translateCaptionsCommand,
      args: ['--track-id', 'track_test', '--to-language-code', 'es'],
      parameters: { track_id: 'track_test', output_language_code: 'es' },
    },
    {
      name: 'key moment duration',
      command: findKeyMomentsCommand,
      args: [
        '--target-duration-min-ms',
        '15125',
        '--target-duration-max-ms',
        '45000',
      ],
      parameters: { target_duration: { min: 15.125, max: 45 } },
    },
    {
      name: 'key moment maximum',
      command: findKeyMomentsCommand,
      args: ['--max-moments', '25'],
      parameters: { max_moments: 25 },
    },
    {
      name: 'premium caption replacement',
      command: generatePremiumCaptionsCommand,
      args: ['--replace-existing'],
      parameters: { replace_existing_tracks: 'replace_generated' },
    },
    {
      name: 'keep source captions',
      command: editCaptionsCommand,
      args: [
        '--track-id',
        'track_test',
        '--replace',
        'old=new',
        '--track-name',
        'Edited',
      ],
      parameters: {
        track_id: 'track_test',
        replacements: [{ find: 'old', replace: 'new' }],
        track_name: 'Edited',
        replace_existing_tracks: 'fail',
      },
    },
    {
      name: 'replace source captions',
      command: editCaptionsCommand,
      args: [
        '--track-id',
        'track_test',
        '--replace',
        'old=new',
        '--replace-existing-tracks',
        'replace',
      ],
      parameters: {
        track_id: 'track_test',
        replacements: [{ find: 'old', replace: 'new' }],
        replace_existing_tracks: 'replace',
      },
    },
    {
      name: 'download edited captions',
      command: editCaptionsCommand,
      args: ['--track-id', 'track_test', '--replace', 'old=new', '--no-upload'],
      parameters: {
        track_id: 'track_test',
        replacements: [{ find: 'old', replace: 'new' }],
        replace_existing_tracks: 'fail',
        upload_to_mux: false,
      },
    },
    {
      name: 'analyze structure',
      command: analyzeStructureCommand,
      args: ['--granularity', 'fine'],
      parameters: { output_steering: { granularity: 'fine' } },
    },
  ];

  let clientSpy: ReturnType<typeof spyOn> | undefined;
  let logSpy: ReturnType<typeof spyOn> | undefined;
  afterEach(() => {
    clientSpy?.mockRestore();
    logSpy?.mockRestore();
  });

  for (const example of examples) {
    test(`maps ${example.name} flags to v1 request parameters`, async () => {
      const { client, requests } = createClient();
      clientSpy = spyOn(auth, 'createAuthenticatedMuxClient').mockResolvedValue(
        client,
      );
      logSpy = spyOn(console, 'log').mockImplementation(() => {});

      await example.command.parse(['asset_test', ...example.args, '--json']);

      expect(requests).toHaveLength(1);
      expect(await requests[0]?.json()).toEqual({
        parameters: { asset_id: 'asset_test', ...example.parameters },
      });
      expect(new URL(requests[0]?.url ?? '').pathname).toStartWith(
        '/robots/v1/jobs/',
      );
    });
  }

  test.each([
    'prompt_overrides',
    'target_duration_ms',
    'to_language_code',
    'delete_original_track',
    'track_name_suffix',
    'replace_existing',
    'min_scene_duration_ms',
    'min_scenes',
  ])('rejects legacy %s file parameters before making API calls', async (field) => {
    const dir = await mkdtemp(join(tmpdir(), 'mux-cli-v1-test-'));
    try {
      const path = join(dir, 'job.json');
      await writeFile(path, JSON.stringify({ [field]: false }));
      await expect(loadJobParameters(path, 'asset_test')).rejects.toThrow(
        `Robots v0 parameters are no longer supported: ${field}`,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
