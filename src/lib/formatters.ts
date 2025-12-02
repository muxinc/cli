import { colors } from '@cliffy/ansi/colors';
import type { Asset } from '@mux/mux-node/resources/video/assets';
import type { LiveStream } from '@mux/mux-node/resources/video/live-streams';

/**
 * Format created_at timestamp to short format (MM/DD HH:MM)
 * Mux API returns Unix timestamp as a string
 */
export function formatCreatedAt(createdAt: string | undefined): string {
  if (!createdAt) return '-';
  const timestamp = Number.parseInt(createdAt, 10);
  if (Number.isNaN(timestamp)) return '-';
  const date = new Date(timestamp * 1000);

  // Check if date is valid
  if (Number.isNaN(date.getTime())) return '-';

  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');

  return `${month}/${day} ${hours}:${minutes}`;
}

/**
 * Format duration as m:ss
 */
export function formatDuration(duration: number | undefined): string {
  if (!duration) return '-';
  const mins = Math.floor(duration / 60);
  const secs = Math.floor(duration % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format asset status with color
 */
export function formatAssetStatus(status: string | undefined): string {
  switch (status) {
    case 'ready':
      return colors.green(status);
    case 'preparing':
      return colors.yellow(status);
    case 'errored':
      return colors.red(status);
    default:
      return colors.dim(status ?? 'unknown');
  }
}

/**
 * Format live stream status with color
 */
export function formatLiveStreamStatus(status: string | undefined): string {
  switch (status) {
    case 'active':
      return colors.green(status);
    case 'idle':
      return colors.dim(status);
    case 'disabled':
      return colors.red(status);
    default:
      return colors.dim(status ?? 'unknown');
  }
}

/**
 * Format seconds into a human-readable duration (e.g., "12h", "60s", "2h 30m")
 */
export function formatSeconds(seconds: number | undefined): string {
  if (!seconds) return '-';

  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0 && mins === 0) {
    return `${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  if (mins > 0 && secs === 0) {
    return `${mins}m`;
  }
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

/**
 * Truncate a string showing first and last N characters
 * e.g., "c3eb0bad-a691-0d1d-f07c-286e65b41724" -> "c3eb...1724"
 */
export function truncateMiddle(
  str: string | undefined,
  startChars = 4,
  endChars = 4,
): string {
  if (!str) return '-';
  if (str.length <= startChars + endChars + 3) return str;
  return `${str.slice(0, startChars)}...${str.slice(-endChars)}`;
}

/**
 * Format an asset for pretty console output
 */
export function formatAsset(asset: Asset): void {
  console.log(`Asset ID: ${asset.id}`);
  console.log(`Status: ${asset.status}`);
  console.log(
    `Duration: ${asset.duration ? `${asset.duration.toFixed(2)}s` : 'N/A'}`,
  );
  console.log(`Created: ${asset.created_at}`);

  if (asset.aspect_ratio) {
    console.log(`Aspect Ratio: ${asset.aspect_ratio}`);
  }

  if (asset.resolution_tier) {
    console.log(`Resolution Tier: ${asset.resolution_tier}`);
  }

  if (asset.video_quality) {
    console.log(`Video Quality: ${asset.video_quality}`);
  }

  if (asset.max_stored_resolution) {
    console.log(`Max Resolution: ${asset.max_stored_resolution}`);
  }

  if (asset.max_stored_frame_rate) {
    console.log(`Max Frame Rate: ${asset.max_stored_frame_rate} fps`);
  }

  if (asset.playback_ids && asset.playback_ids.length > 0) {
    console.log('\nPlayback IDs:');
    for (const playbackId of asset.playback_ids) {
      console.log(`  - ${playbackId.id} (${playbackId.policy})`);
      console.log(`    URL: https://stream.mux.com/${playbackId.id}.m3u8`);
    }
  }

  if (asset.tracks && asset.tracks.length > 0) {
    console.log('\nTracks:');
    for (const track of asset.tracks) {
      console.log(`  - ${track.type}: ${track.id}`);
      if (track.duration) {
        console.log(`    Duration: ${track.duration.toFixed(2)}s`);
      }
    }
  }

  if (asset.passthrough) {
    console.log(`\nPassthrough: ${asset.passthrough}`);
  }

  if (asset.test) {
    console.log(
      '\nWARNING: This is a test asset (will be deleted after 24 hours)',
    );
  }

  if (asset.errors?.messages && asset.errors.messages.length > 0) {
    console.log('\nErrors:');
    for (const error of asset.errors.messages) {
      console.log(`  - ${error}`);
    }
  }
}

/**
 * Format a live stream for pretty console output
 */
export function formatLiveStream(stream: LiveStream): void {
  console.log(`Stream ID: ${stream.id}`);
  console.log(`Status: ${stream.status}`);
  console.log(`Created: ${stream.created_at}`);
  console.log(`Stream Key: ${stream.stream_key}`);

  if (stream.latency_mode) {
    console.log(`Latency Mode: ${stream.latency_mode}`);
  }

  if (stream.reconnect_window) {
    console.log(`Reconnect Window: ${stream.reconnect_window}s`);
  }

  if (stream.playback_ids && stream.playback_ids.length > 0) {
    console.log('\nPlayback IDs:');
    for (const playbackId of stream.playback_ids) {
      console.log(`  - ${playbackId.id} (${playbackId.policy})`);
      console.log(`    URL: https://stream.mux.com/${playbackId.id}.m3u8`);
    }
  }

  if (stream.recent_asset_ids && stream.recent_asset_ids.length > 0) {
    console.log('\nRecent Assets:');
    for (const assetId of stream.recent_asset_ids) {
      console.log(`  - ${assetId}`);
    }
  }

  if (stream.test) {
    console.log(
      '\nWARNING: This is a test stream (will be deleted after 24 hours)',
    );
  }
}
