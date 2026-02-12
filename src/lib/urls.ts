const STREAM_BASE_URL = 'https://stream.mux.com';
const IMAGE_BASE_URL = 'https://image.mux.com';
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

/**
 * Generate a thumbnail URL for a playback ID
 */
export function getThumbnailUrl(playbackId: string, token?: string): string {
  const url = `${IMAGE_BASE_URL}/${playbackId}/thumbnail.png`;
  if (token) {
    return `${url}?token=${token}`;
  }
  return url;
}

/**
 * Generate an animated GIF URL for a playback ID
 */
export function getGifUrl(playbackId: string, token?: string): string {
  const url = `${IMAGE_BASE_URL}/${playbackId}/animated.gif`;
  if (token) {
    return `${url}?token=${token}`;
  }
  return url;
}

/**
 * Generate a storyboard URL for a playback ID
 */
export function getStoryboardUrl(playbackId: string, token?: string): string {
  const url = `${IMAGE_BASE_URL}/${playbackId}/storyboard.vtt`;
  if (token) {
    return `${url}?token=${token}`;
  }
  return url;
}

/**
 * Generate the appropriate signed URL based on token type
 */
export function getSignedUrl(
  playbackId: string,
  token: string,
  type: 'video' | 'thumbnail' | 'gif' | 'storyboard',
): string {
  switch (type) {
    case 'thumbnail':
      return getThumbnailUrl(playbackId, token);
    case 'gif':
      return getGifUrl(playbackId, token);
    case 'storyboard':
      return getStoryboardUrl(playbackId, token);
    default:
      return getStreamUrl(playbackId, token);
  }
}
