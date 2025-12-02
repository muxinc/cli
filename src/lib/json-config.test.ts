import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseAssetConfig } from './json-config.ts';

describe('parseAssetConfig', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'mux-cli-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test('parses valid minimal asset config with URL input', async () => {
    const config = {
      input: [
        {
          url: 'https://example.com/video.mp4',
        },
      ],
      playback_policies: ['public'],
    };

    const configPath = join(tempDir, 'config.json');
    await writeFile(configPath, JSON.stringify(config));

    const result = await parseAssetConfig(configPath);

    expect(result).toEqual(config);
  });

  test('parses valid config with all common options', async () => {
    const config = {
      input: [
        {
          url: 'https://example.com/video.mp4',
        },
      ],
      playback_policies: ['public'],
      test: true,
      video_quality: 'plus',
      static_renditions: [{ resolution: '1080p' }],
      max_resolution_tier: '1080p',
      normalize_audio: true,
      passthrough: 'my-video-123',
    };

    const configPath = join(tempDir, 'config.json');
    await writeFile(configPath, JSON.stringify(config));

    const result = await parseAssetConfig(configPath);

    expect(result).toEqual(config);
  });

  test('parses complex config with overlay and subtitles', async () => {
    const config = {
      input: [
        {
          url: 'https://example.com/video.mp4',
          overlay_settings: {
            url: 'https://example.com/logo.png',
            vertical_align: 'bottom',
            horizontal_align: 'right',
            vertical_margin: '5%',
            horizontal_margin: '5%',
            opacity: '80%',
          },
          generated_subtitles: [
            {
              language_code: 'en',
              name: 'English',
            },
          ],
        },
      ],
      playback_policies: ['signed'],
      video_quality: 'basic',
    };

    const configPath = join(tempDir, 'config.json');
    await writeFile(configPath, JSON.stringify(config));

    const result = await parseAssetConfig(configPath);

    expect(result).toEqual(config);
  });

  test('parses config with multiple input tracks', async () => {
    const config = {
      input: [
        {
          url: 'https://example.com/video.mp4',
          type: 'video',
        },
        {
          url: 'https://example.com/subtitles.vtt',
          type: 'text',
          text_type: 'subtitles',
          language_code: 'en',
          name: 'English',
          closed_captions: false,
        },
      ],
      playback_policies: ['public'],
    };

    const configPath = join(tempDir, 'config.json');
    await writeFile(configPath, JSON.stringify(config));

    const result = await parseAssetConfig(configPath);

    expect(result).toEqual(config);
  });

  test('throws error when file does not exist', () => {
    const configPath = join(tempDir, 'nonexistent.json');

    expect(async () => {
      await parseAssetConfig(configPath);
    }).toThrow(/file not found/i);
  });

  test('throws error when file contains invalid JSON', async () => {
    const configPath = join(tempDir, 'invalid.json');
    await writeFile(configPath, '{ invalid json }');

    expect(async () => {
      await parseAssetConfig(configPath);
    }).toThrow(/invalid json/i);
  });

  test('parses config without playback_policies', async () => {
    const config = {
      input: [
        {
          url: 'https://example.com/video.mp4',
        },
      ],
    };

    const configPath = join(tempDir, 'config.json');
    await writeFile(configPath, JSON.stringify(config));

    const result = await parseAssetConfig(configPath);

    expect(result).toEqual(config);
  });
});
