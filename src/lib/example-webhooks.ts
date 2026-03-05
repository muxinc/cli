import { randomBytes } from 'node:crypto';

/**
 * All supported webhook event types for triggering example events.
 */
export const WEBHOOK_EVENT_TYPES = [
  'video.asset.created',
  'video.asset.ready',
  'video.asset.errored',
  'video.asset.updated',
  'video.asset.deleted',
  'video.asset.live_stream_completed',
  'video.asset.static_renditions.ready',
  'video.asset.static_renditions.preparing',
  'video.asset.static_renditions.deleted',
  'video.asset.static_renditions.errored',
  'video.asset.master.ready',
  'video.asset.master.preparing',
  'video.asset.master.deleted',
  'video.asset.master.errored',
  'video.asset.track.created',
  'video.asset.track.ready',
  'video.asset.track.errored',
  'video.asset.track.deleted',
  'video.asset.static_rendition.created',
  'video.asset.static_rendition.ready',
  'video.asset.static_rendition.errored',
  'video.asset.static_rendition.deleted',
  'video.asset.static_rendition.skipped',
  'video.asset.warning',
  'video.upload.asset_created',
  'video.upload.cancelled',
  'video.upload.created',
  'video.upload.errored',
  'video.live_stream.created',
  'video.live_stream.connected',
  'video.live_stream.recording',
  'video.live_stream.active',
  'video.live_stream.disconnected',
  'video.live_stream.idle',
  'video.live_stream.updated',
  'video.live_stream.enabled',
  'video.live_stream.disabled',
  'video.live_stream.deleted',
  'video.live_stream.warning',
  'video.live_stream.simulcast_target.created',
  'video.live_stream.simulcast_target.idle',
  'video.live_stream.simulcast_target.starting',
  'video.live_stream.simulcast_target.broadcasting',
  'video.live_stream.simulcast_target.errored',
  'video.live_stream.simulcast_target.deleted',
  'video.live_stream.simulcast_target.updated',
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

function generateId(): string {
  return randomBytes(16).toString('base64url');
}

function generateEventId(): string {
  // UUID-like format matching Mux event IDs
  const bytes = randomBytes(16);
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

function nowISO(): string {
  return new Date().toISOString().replace('Z', '000Z');
}

function exampleAsset(status: string, id?: string): Record<string, unknown> {
  const assetId = id ?? generateId();
  const base: Record<string, unknown> = {
    id: assetId,
    status,
    created_at: nowUnix(),
    video_quality: 'plus',
    max_resolution_tier: '1080p',
    encoding_tier: 'smart',
    ingest_type: 'on_demand_url',
    master_access: 'none',
    mp4_support: 'none',
    normalize_audio: false,
    passthrough: '',
    is_live: false,
    test: false,
    meta: { title: '', creator_id: '', external_id: '' },
    progress:
      status === 'ready'
        ? { state: 'completed', progress: 100 }
        : status === 'errored'
          ? { state: 'errored', progress: -1 }
          : { state: 'ingesting', progress: 0 },
  };

  if (status === 'ready') {
    Object.assign(base, {
      duration: 120.5,
      aspect_ratio: '16:9',
      max_stored_resolution: 'HD',
      max_stored_frame_rate: 29.97,
      resolution_tier: '1080p',
      tracks: [
        {
          type: 'video',
          id: generateId(),
          status: 'ready',
          primary: true,
          max_width: 1920,
          max_height: 1080,
          max_frame_rate: 29.97,
          duration: 120.5,
        },
        {
          type: 'audio',
          id: generateId(),
          status: 'ready',
          primary: true,
          name: 'Default',
          language_code: 'und',
          max_channels: 2,
          duration: 120.5,
        },
      ],
      playback_ids: [
        {
          id: generateId(),
          policy: 'public',
        },
      ],
      static_renditions: {
        status: 'ready',
      },
    });
  }

  if (status === 'errored') {
    Object.assign(base, {
      errors: {
        type: 'invalid_input',
        messages: ['The input file is not a valid video file.'],
      },
    });
  }

  return base;
}

function exampleUpload(status: string, id?: string): Record<string, unknown> {
  return {
    id: id ?? generateId(),
    status,
    created_at: nowUnix(),
    timeout: 3600,
    new_asset_settings: {
      playback_policies: ['public'],
    },
    cors_origin: 'https://example.com',
    ...(status === 'asset_created' ? { asset_id: generateId() } : {}),
  };
}

function exampleLiveStream(
  status: string,
  id?: string,
): Record<string, unknown> {
  const streamId = id ?? generateId();
  return {
    id: streamId,
    status,
    created_at: nowUnix(),
    stream_key: generateId(),
    playback_ids: [
      {
        id: generateId(),
        policy: 'public',
      },
    ],
    new_asset_settings: {
      playback_policies: ['public'],
    },
    latency_mode: 'low',
    reconnect_window: 60,
    max_continuous_duration: 43200,
  };
}

function exampleTrack(status: string, id?: string): Record<string, unknown> {
  return {
    id: id ?? generateId(),
    type: 'text',
    text_type: 'subtitles',
    language_code: 'en',
    name: 'English',
    status,
    ...(status === 'ready' ? { duration: 120.5 } : {}),
    ...(status === 'errored'
      ? {
          errors: {
            type: 'invalid_input',
            messages: ['The subtitle file could not be parsed.'],
          },
        }
      : {}),
  };
}

function exampleStaticRendition(
  status: string,
  id?: string,
): Record<string, unknown> {
  return {
    id: id ?? generateId(),
    name: '720p.mp4',
    ext: 'mp4',
    resolution: '720p',
    resolution_tier: '720p',
    width: 1280,
    height: 720,
    bitrate: 2000000,
    filesize: '30000000',
    status,
    type: 'standard',
  };
}

function exampleSimulcastTarget(
  status: string,
  id?: string,
): Record<string, unknown> {
  return {
    id: id ?? generateId(),
    status,
    url: 'rtmp://live.example.com/app',
    stream_key: generateId(),
    passthrough: '',
  };
}

function getObjectType(eventType: string): { type: string; id: string } {
  if (eventType.startsWith('video.upload.')) {
    return { type: 'upload', id: generateId() };
  }
  if (eventType.startsWith('video.live_stream.simulcast_target.')) {
    return { type: 'simulcast-target', id: generateId() };
  }
  if (eventType.startsWith('video.live_stream.')) {
    return { type: 'live-stream', id: generateId() };
  }
  if (eventType.includes('.track.')) {
    return { type: 'track', id: generateId() };
  }
  if (eventType.includes('.static_rendition.')) {
    return { type: 'static-rendition', id: generateId() };
  }
  return { type: 'asset', id: generateId() };
}

function getDataForEventType(
  eventType: string,
  objectId: string,
): Record<string, unknown> {
  // Asset events
  if (eventType === 'video.asset.created')
    return exampleAsset('preparing', objectId);
  if (eventType === 'video.asset.ready') return exampleAsset('ready', objectId);
  if (eventType === 'video.asset.errored')
    return exampleAsset('errored', objectId);
  if (
    eventType === 'video.asset.updated' ||
    eventType === 'video.asset.deleted' ||
    eventType === 'video.asset.live_stream_completed' ||
    eventType === 'video.asset.warning' ||
    eventType === 'video.asset.non_standard_input_detected'
  )
    return exampleAsset('ready', objectId);

  // Static renditions (plural — asset-level)
  if (eventType.startsWith('video.asset.static_renditions.'))
    return exampleAsset('ready', objectId);

  // Master events
  if (eventType.startsWith('video.asset.master.'))
    return exampleAsset('ready', objectId);

  // Track events
  if (eventType === 'video.asset.track.created')
    return exampleTrack('preparing', objectId);
  if (eventType === 'video.asset.track.ready')
    return exampleTrack('ready', objectId);
  if (eventType === 'video.asset.track.errored')
    return exampleTrack('errored', objectId);
  if (eventType === 'video.asset.track.deleted')
    return exampleTrack('ready', objectId);

  // Static rendition (singular — individual rendition)
  if (eventType === 'video.asset.static_rendition.created')
    return exampleStaticRendition('preparing', objectId);
  if (eventType === 'video.asset.static_rendition.ready')
    return exampleStaticRendition('ready', objectId);
  if (eventType === 'video.asset.static_rendition.errored')
    return exampleStaticRendition('errored', objectId);
  if (eventType === 'video.asset.static_rendition.deleted')
    return exampleStaticRendition('ready', objectId);
  if (eventType === 'video.asset.static_rendition.skipped')
    return exampleStaticRendition('skipped', objectId);

  // Upload events
  if (eventType === 'video.upload.created')
    return exampleUpload('waiting', objectId);
  if (eventType === 'video.upload.asset_created')
    return exampleUpload('asset_created', objectId);
  if (eventType === 'video.upload.cancelled')
    return exampleUpload('cancelled', objectId);
  if (eventType === 'video.upload.errored')
    return exampleUpload('errored', objectId);

  // Live stream events
  if (eventType === 'video.live_stream.created')
    return exampleLiveStream('idle', objectId);
  if (eventType === 'video.live_stream.connected')
    return exampleLiveStream('connected', objectId);
  if (eventType === 'video.live_stream.recording')
    return exampleLiveStream('recording', objectId);
  if (eventType === 'video.live_stream.active')
    return exampleLiveStream('active', objectId);
  if (eventType === 'video.live_stream.disconnected')
    return exampleLiveStream('disconnected', objectId);
  if (eventType === 'video.live_stream.idle')
    return exampleLiveStream('idle', objectId);
  if (
    eventType === 'video.live_stream.updated' ||
    eventType === 'video.live_stream.enabled' ||
    eventType === 'video.live_stream.disabled' ||
    eventType === 'video.live_stream.deleted' ||
    eventType === 'video.live_stream.warning'
  )
    return exampleLiveStream('idle', objectId);

  // Simulcast target events
  if (eventType === 'video.live_stream.simulcast_target.created')
    return exampleSimulcastTarget('idle', objectId);
  if (eventType === 'video.live_stream.simulcast_target.idle')
    return exampleSimulcastTarget('idle', objectId);
  if (eventType === 'video.live_stream.simulcast_target.starting')
    return exampleSimulcastTarget('starting', objectId);
  if (eventType === 'video.live_stream.simulcast_target.broadcasting')
    return exampleSimulcastTarget('broadcasting', objectId);
  if (eventType === 'video.live_stream.simulcast_target.errored')
    return exampleSimulcastTarget('errored', objectId);
  if (eventType === 'video.live_stream.simulcast_target.deleted')
    return exampleSimulcastTarget('deleted', objectId);
  if (eventType === 'video.live_stream.simulcast_target.updated')
    return exampleSimulcastTarget('idle', objectId);

  // Fallback
  return exampleAsset('ready', objectId);
}

/**
 * Generate a synthetic webhook event payload for a given event type.
 */
export function generateExampleWebhook(
  eventType: WebhookEventType,
  envName: string,
  envId: string,
): Record<string, unknown> {
  const objectInfo = getObjectType(eventType);

  return {
    type: eventType,
    id: generateEventId(),
    created_at: nowISO(),
    object: objectInfo,
    environment: {
      name: envName,
      id: envId,
    },
    data: getDataForEventType(eventType, objectInfo.id),
    request_id: null,
    attempts: [],
    accessor: null,
    accessor_source: null,
  };
}
