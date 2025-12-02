const STREAM_BASE_URL = 'https://stream.mux.com';
const PLAYER_BASE_URL = 'https://player.mux.com';

/**
 * Generate an HLS stream URL for a playback ID
 */
export function getStreamUrl(playbackId: string, token?: string): string {
  const url = `${STREAM_BASE_URL}/${playbackId}.m3u8`;
  if (token) {
    return `${url}?token=${token}`;
  }
  return url;
}

/**
 * Generate a Mux Player URL for a playback ID
 */
export function getPlayerUrl(playbackId: string, token?: string): string {
  const url = `${PLAYER_BASE_URL}/${playbackId}`;
  if (token) {
    return `${url}?playback-token=${token}`;
  }
  return url;
}
