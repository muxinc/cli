import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  spyOn,
  test,
} from 'bun:test';
import { formatMs, resolveTarget } from './_shared.ts';
import { heatmapCommand } from './heatmap.ts';
import { hotspotsCommand } from './hotspots.ts';
import { engagementCommand } from './index.ts';

// Note: These tests focus on CLI flag parsing and command structure
// They do NOT test the actual Mux API integration (that's tested via E2E)

describe('mux engagement commands', () => {
  let exitSpy: Mock<typeof process.exit>;
  let consoleErrorSpy: Mock<typeof console.error>;

  beforeEach(() => {
    exitSpy = spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
  });

  describe('Command group', () => {
    test('has correct group description', () => {
      expect(engagementCommand.getDescription()).toMatch(/engagement/i);
    });

    test.each([
      'heatmap',
      'hotspots',
    ])('registers the %s subcommand', (name) => {
      expect(engagementCommand.getCommand(name)).toBeDefined();
    });
  });

  describe('resolveTarget', () => {
    test('resolves an asset target', () => {
      expect(resolveTarget({ assetId: 'asset_1' })).toEqual({
        kind: 'asset',
        id: 'asset_1',
      });
    });

    test('resolves a playback-id target', () => {
      expect(resolveTarget({ playbackId: 'pb_1' })).toEqual({
        kind: 'playback-id',
        id: 'pb_1',
      });
    });

    test('resolves a video target', () => {
      expect(resolveTarget({ videoId: 'vid_1' })).toEqual({
        kind: 'video',
        id: 'vid_1',
      });
    });

    test('rejects when no target is given', () => {
      expect(() => resolveTarget({})).toThrow(/exactly one/i);
    });

    test('rejects when multiple targets are given', () => {
      expect(() =>
        resolveTarget({ assetId: 'asset_1', playbackId: 'pb_1' }),
      ).toThrow(/exactly one/i);
    });
  });

  describe('formatMs', () => {
    test('formats milliseconds as minutes and seconds', () => {
      expect(formatMs(0)).toBe('0:00');
      expect(formatMs(61_500)).toBe('1:01');
      expect(formatMs(600_000)).toBe('10:00');
    });
  });

  describe.each([
    ['heatmap', heatmapCommand],
    ['hotspots', hotspotsCommand],
  ])('mux engagement %s', (_name, command) => {
    test.each([
      'asset-id',
      'playback-id',
      'video-id',
      'timeframe',
      'json',
    ])('has --%s flag', (flag) => {
      const option = command.getOptions().find((opt) => opt.name === flag);
      expect(option).toBeDefined();
    });

    test('errors when no target flag is provided', async () => {
      try {
        await command.parse([]);
      } catch (_error) {
        // Expected
      }
      expect(exitSpy).toHaveBeenCalledWith(1);
      const msg = consoleErrorSpy.mock.calls[0]?.[0] ?? '';
      expect(msg).toMatch(/exactly one/i);
    });
  });

  describe('mux engagement hotspots', () => {
    test.each(['limit', 'order-direction'])('has --%s flag', (flag) => {
      const option = hotspotsCommand
        .getOptions()
        .find((opt) => opt.name === flag);
      expect(option).toBeDefined();
    });

    test('rejects invalid --order-direction value', async () => {
      let errorThrown = false;
      let errorMessage = '';
      try {
        await engagementCommand.parse([
          'hotspots',
          '--asset-id',
          'asset_1',
          '--order-direction',
          'sideways',
        ]);
      } catch (error) {
        errorThrown = true;
        errorMessage = error instanceof Error ? error.message : String(error);
      }
      expect(errorThrown).toBe(true);
      expect(errorMessage).toMatch(/order-direction/i);
    });
  });
});
