import type Mux from '@mux/mux-node';

export type PlaybackIdPolicy = 'public' | 'signed';

export interface PlaybackId {
  id: string;
  policy: PlaybackIdPolicy;
}

/**
 * Create a new playback ID for an asset
 */
export async function createPlaybackId(
  mux: Mux,
  assetId: string,
  policy: PlaybackIdPolicy,
): Promise<PlaybackId> {
  const result = await mux.video.assets.createPlaybackId(assetId, { policy });
  return {
    id: result.id as string,
    policy: result.policy as PlaybackIdPolicy,
  };
}

/**
 * Delete a playback ID from an asset
 */
export async function deletePlaybackId(
  mux: Mux,
  assetId: string,
  playbackId: string,
): Promise<void> {
  await mux.video.assets.deletePlaybackId(assetId, playbackId);
}

/**
 * Create a new playback ID for a live stream
 */
export async function createLiveStreamPlaybackId(
  mux: Mux,
  liveStreamId: string,
  policy: PlaybackIdPolicy,
): Promise<PlaybackId> {
  const result = await mux.video.liveStreams.createPlaybackId(liveStreamId, {
    policy,
  });
  return {
    id: result.id as string,
    policy: result.policy as PlaybackIdPolicy,
  };
}

/**
 * Delete a playback ID from a live stream
 */
export async function deleteLiveStreamPlaybackId(
  mux: Mux,
  liveStreamId: string,
  playbackId: string,
): Promise<void> {
  await mux.video.liveStreams.deletePlaybackId(liveStreamId, playbackId);
}
