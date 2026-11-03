import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createBucketCaptionHost,
  createLocalCaptionStore,
  hostBucketConfig,
} from './captions.ts';
import { routeFetch } from './testing/route-fetch.ts';

describe('createLocalCaptionStore', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mux-cli-migrate-captions-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('writes each caption under captions/ with a safe file name', async () => {
    const store = createLocalCaptionStore(dir);

    const path = await store.saveLocal('folder/video 1', {
      kind: 'text',
      text: 'WEBVTT\n',
      format: 'vtt',
      language: 'en',
      closedCaptions: false,
    });

    expect(path).toBe(join(dir, 'captions', 'folder_video_1.en.vtt'));
    expect(await readFile(path, 'utf-8')).toBe('WEBVTT\n');
  });
});

describe('createBucketCaptionHost', () => {
  const config = {
    bucket: 'captions-bucket',
    region: 'us-east-1',
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'secret',
  };

  test('uploads a caption and returns a presigned GET URL, then deletes it', async () => {
    const { fetch, requests } = routeFetch({
      'PUT captions-bucket.s3.us-east-1.amazonaws.com/mux-migrate/mig_1/a/en.srt':
        () => new Response(null, { status: 200 }),
      'DELETE captions-bucket.s3.us-east-1.amazonaws.com/mux-migrate/mig_1/a/en.srt':
        () => new Response(null, { status: 204 }),
    });
    const host = createBucketCaptionHost(config, {
      fetch,
      now: () => new Date('2026-10-05T12:00:00Z'),
    });

    const url = await host.upload('mux-migrate/mig_1/a/en.srt', {
      kind: 'text',
      text: '1\n00:00:00,000 --> 00:00:01,000\nHello\n',
      format: 'srt',
      language: 'en',
      closedCaptions: false,
    });
    await host.remove('mux-migrate/mig_1/a/en.srt');

    expect(requests.map((r) => r.method)).toEqual(['PUT', 'DELETE']);
    expect(requests[0].body).toContain('Hello');
    const presigned = new URL(url);
    expect(presigned.host).toBe('captions-bucket.s3.us-east-1.amazonaws.com');
    expect(presigned.pathname).toBe('/mux-migrate/mig_1/a/en.srt');
    expect(presigned.searchParams.get('X-Amz-Expires')).toBe('86400');
    expect(presigned.searchParams.get('X-Amz-Signature')).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });
});

describe('hostBucketConfig', () => {
  test('reads the bucket credentials from AWS environment variables', () => {
    expect(
      hostBucketConfig('captions-bucket', {
        AWS_ACCESS_KEY_ID: 'id',
        AWS_SECRET_ACCESS_KEY: 'secret',
        AWS_REGION: 'auto',
        AWS_ENDPOINT_URL: 'https://r2.example.com',
      }),
    ).toEqual({
      bucket: 'captions-bucket',
      accessKeyId: 'id',
      secretAccessKey: 'secret',
      region: 'auto',
      endpoint: 'https://r2.example.com',
    });
  });

  test('fails with CAPTIONS_HOST_CREDENTIALS_MISSING without them', () => {
    expect(() => hostBucketConfig('captions-bucket', {})).toThrow(
      expect.objectContaining({ code: 'CAPTIONS_HOST_CREDENTIALS_MISSING' }),
    );
  });
});
