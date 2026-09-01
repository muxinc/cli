export interface TargetOptions {
  assetId?: string;
  playbackId?: string;
  videoId?: string;
}

export type EngagementTarget =
  | { kind: 'asset'; id: string }
  | { kind: 'playback-id'; id: string }
  | { kind: 'video'; id: string };

export function resolveTarget(options: TargetOptions): EngagementTarget {
  const targets: EngagementTarget[] = [];
  if (options.assetId) targets.push({ kind: 'asset', id: options.assetId });
  if (options.playbackId)
    targets.push({ kind: 'playback-id', id: options.playbackId });
  if (options.videoId) targets.push({ kind: 'video', id: options.videoId });

  if (targets.length !== 1) {
    throw new Error(
      'Specify exactly one of --asset-id, --playback-id, or --video-id',
    );
  }
  return targets[0];
}

export function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
