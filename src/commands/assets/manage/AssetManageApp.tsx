/** @jsxImportSource @opentui/react */
import type Mux from '@mux/mux-node';
import type { Asset } from '@mux/mux-node/resources/video/assets';
import { useKeyboard, useRenderer } from '@opentui/react';
import { useCallback, useEffect, useState } from 'react';
import { getDefaultEnvironment } from '../../../lib/config.ts';
import {
  createPlaybackId,
  deletePlaybackId,
} from '../../../lib/playback-ids.ts';
import { hasSigningKeys, signPlaybackId } from '../../../lib/signing.ts';
import {
  type Action,
  ActionMenu,
  ConfirmDialog,
  copyToClipboard,
  SelectList,
  type SelectListItem,
} from '../../../lib/tui/index.ts';
import { getPlayerUrl, getStreamUrl } from '../../../lib/urls.ts';

type View =
  | 'list'
  | 'actions'
  | 'confirm-delete'
  | 'confirm-delete-playback'
  | 'select-playback-id'
  | 'select-playback-policy'
  | 'select-playback-for-copy'
  | 'view-static-renditions'
  | 'select-resolution'
  | 'select-rendition-for-delete'
  | 'confirm-delete-rendition'
  | 'select-rendition-for-copy'
  | 'loading'
  | 'message';

type CopyType = 'stream' | 'player';

type StaticRenditionFile = NonNullable<
  NonNullable<Asset['static_renditions']>['files']
>[number];

type Resolution =
  | 'highest'
  | 'audio-only'
  | '2160p'
  | '1440p'
  | '1080p'
  | '720p'
  | '540p'
  | '480p'
  | '360p'
  | '270p';

interface AssetManageAppProps {
  mux: Mux;
}

export function AssetManageApp({ mux }: AssetManageAppProps) {
  const renderer = useRenderer();
  const [view, setView] = useState<View>('loading');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [selectedPlaybackId, setSelectedPlaybackId] = useState<string | null>(
    null,
  );
  const [selectedRendition, setSelectedRendition] =
    useState<StaticRenditionFile | null>(null);
  const [copyType, setCopyType] = useState<CopyType | null>(null);
  const [message, setMessage] = useState<string>('');
  const [messageType, setMessageType] = useState<'success' | 'error'>(
    'success',
  );
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Define showMessage first since other hooks depend on it
  const showMessage = useCallback(
    (msg: string, type: 'success' | 'error' = 'success') => {
      setMessage(msg);
      setMessageType(type);
      setView('message');
    },
    [],
  );

  // getSignedToken wrapped in useCallback since copyUrl depends on it
  const getSignedToken = useCallback(
    async (playbackId: string): Promise<string | null> => {
      try {
        const env = await getDefaultEnvironment();
        if (!env) return null;

        const credentials = {
          signingKeyId: env.environment.signingKeyId,
          signingPrivateKey: env.environment.signingPrivateKey,
        };

        if (!hasSigningKeys(credentials)) {
          return null;
        }

        return await signPlaybackId(
          playbackId,
          credentials,
          {
            tokenId: env.environment.tokenId,
            tokenSecret: env.environment.tokenSecret,
          },
          { expiration: '7d' },
        );
      } catch {
        return null;
      }
    },
    [],
  );

  const loadAssets = useCallback(
    async (pageNum = 1) => {
      try {
        if (pageNum === 1) {
          setView('loading');
        } else {
          setLoadingMore(true);
        }
        const response = await mux.video.assets.list({
          page: pageNum,
          limit: 25,
        });
        if (pageNum === 1) {
          setAssets(response.data ?? []);
        } else {
          setAssets((prev) => [...prev, ...(response.data ?? [])]);
        }
        setHasMore((response.data?.length ?? 0) === 25);
        setPage(pageNum);
        setLoadingMore(false);
        setView('list');
      } catch (error) {
        setLoadingMore(false);
        showMessage(
          `Failed to load assets: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'error',
        );
      }
    },
    [mux, showMessage],
  );

  // Load assets on mount
  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  const handleAssetSelect = useCallback(
    (item: SelectListItem<Asset | null>) => {
      if (item.id === '__load_more__') {
        loadAssets(page + 1);
        return;
      }
      if (item.value) {
        setSelectedAsset(item.value);
        setView('actions');
      }
    },
    [loadAssets, page],
  );

  const copyUrl = useCallback(
    async (
      type: CopyType,
      playbackId: NonNullable<Asset['playback_ids']>[0],
    ) => {
      try {
        const id = playbackId.id as string;
        let url = type === 'stream' ? getStreamUrl(id) : getPlayerUrl(id);

        if (playbackId.policy === 'signed') {
          const token = await getSignedToken(id);
          if (token) {
            url =
              type === 'stream'
                ? getStreamUrl(id, token)
                : getPlayerUrl(id, token);
          }
        }
        await copyToClipboard(url);
        showMessage(
          `${type === 'stream' ? 'Stream' : 'Player'} URL copied to clipboard!`,
        );
      } catch (error) {
        showMessage(
          `Failed to copy: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'error',
        );
      }
    },
    [showMessage, getSignedToken],
  );

  const copyRenditionUrl = useCallback(
    async (file: StaticRenditionFile) => {
      if (!selectedAsset) return;
      try {
        const playbackId = selectedAsset.playback_ids?.[0]?.id;
        if (!playbackId) {
          showMessage('No playback ID available for download URL', 'error');
          return;
        }
        // Static rendition URL format: https://stream.mux.com/{PLAYBACK_ID}/{RENDITION_NAME}
        const url = `https://stream.mux.com/${playbackId}/${file.name}`;
        await copyToClipboard(url);
        showMessage(`Download URL for ${file.name} copied to clipboard!`);
      } catch (error) {
        showMessage(
          `Failed to copy: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'error',
        );
      }
    },
    [selectedAsset, showMessage],
  );

  const handleAction = useCallback(
    async (actionId: string) => {
      if (!selectedAsset) return;

      const playbackIds = selectedAsset.playback_ids ?? [];

      switch (actionId) {
        case 'copy-stream': {
          if (playbackIds.length === 0) {
            showMessage('No playback ID available', 'error');
            return;
          }
          if (playbackIds.length > 1) {
            setCopyType('stream');
            setView('select-playback-for-copy');
            return;
          }
          await copyUrl('stream', playbackIds[0]);
          break;
        }

        case 'copy-player': {
          if (playbackIds.length === 0) {
            showMessage('No playback ID available', 'error');
            return;
          }
          if (playbackIds.length > 1) {
            setCopyType('player');
            setView('select-playback-for-copy');
            return;
          }
          await copyUrl('player', playbackIds[0]);
          break;
        }

        case 'create-playback':
          setView('select-playback-policy');
          break;

        case 'delete-playback':
          if (!selectedAsset.playback_ids?.length) {
            showMessage('No playback IDs to delete', 'error');
            return;
          }
          if (selectedAsset.playback_ids.length === 1) {
            setSelectedPlaybackId(selectedAsset.playback_ids[0].id as string);
            setView('confirm-delete-playback');
          } else {
            setView('select-playback-id');
          }
          break;

        case 'delete-asset':
          setView('confirm-delete');
          break;

        case 'view-renditions':
          setView('view-static-renditions');
          break;

        case 'create-rendition':
          setView('select-resolution');
          break;

        case 'delete-rendition': {
          const files = selectedAsset.static_renditions?.files ?? [];
          const readyFiles = files.filter((f) => f.id);
          if (readyFiles.length === 0) {
            showMessage('No static renditions to delete', 'error');
            return;
          }
          if (readyFiles.length === 1) {
            setSelectedRendition(readyFiles[0]);
            setView('confirm-delete-rendition');
          } else {
            setView('select-rendition-for-delete');
          }
          break;
        }

        case 'copy-rendition-url': {
          const files = selectedAsset.static_renditions?.files ?? [];
          const readyFiles = files.filter((f) => f.status === 'ready' && f.id);
          if (readyFiles.length === 0) {
            showMessage('No ready static renditions available', 'error');
            return;
          }
          if (readyFiles.length === 1) {
            await copyRenditionUrl(readyFiles[0]);
          } else {
            setView('select-rendition-for-copy');
          }
          break;
        }

        case 'back':
          setSelectedAsset(null);
          setView('list');
          break;
      }
    },
    [selectedAsset, copyUrl, copyRenditionUrl, showMessage],
  );

  const handleCreatePlaybackId = useCallback(
    async (policy: 'public' | 'signed') => {
      if (!selectedAsset) return;
      try {
        setView('loading');
        await createPlaybackId(mux, selectedAsset.id as string, policy);
        // Refresh asset data
        const updated = await mux.video.assets.retrieve(
          selectedAsset.id as string,
        );
        setSelectedAsset(updated);
        setAssets((prev) =>
          prev.map((a) => (a.id === updated.id ? updated : a)),
        );
        showMessage(`Created ${policy} playback ID!`);
      } catch (error) {
        showMessage(
          `Failed to create playback ID: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'error',
        );
      }
    },
    [mux, selectedAsset, showMessage],
  );

  const handleDeletePlaybackId = useCallback(async () => {
    if (!selectedAsset || !selectedPlaybackId) return;
    try {
      setView('loading');
      await deletePlaybackId(
        mux,
        selectedAsset.id as string,
        selectedPlaybackId,
      );
      // Refresh asset data
      const updated = await mux.video.assets.retrieve(
        selectedAsset.id as string,
      );
      setSelectedAsset(updated);
      setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setSelectedPlaybackId(null);
      showMessage('Playback ID deleted!');
    } catch (error) {
      showMessage(
        `Failed to delete playback ID: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
    }
  }, [mux, selectedAsset, selectedPlaybackId, showMessage]);

  const handleCopyPlaybackId = useCallback(
    async (playbackId: NonNullable<Asset['playback_ids']>[0]) => {
      if (!copyType) return;
      await copyUrl(copyType, playbackId);
      setCopyType(null);
    },
    [copyType, copyUrl],
  );

  const handleDeleteAsset = useCallback(async () => {
    if (!selectedAsset) return;
    try {
      setView('loading');
      await mux.video.assets.delete(selectedAsset.id as string);
      setAssets((prev) => prev.filter((a) => a.id !== selectedAsset.id));
      setSelectedAsset(null);
      showMessage('Asset deleted!');
      setView('list');
    } catch (error) {
      showMessage(
        `Failed to delete asset: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
    }
  }, [mux, selectedAsset, showMessage]);

  const handleCreateStaticRendition = useCallback(
    async (resolution: Resolution) => {
      if (!selectedAsset) return;
      try {
        setView('loading');
        await mux.video.assets.createStaticRendition(
          selectedAsset.id as string,
          { resolution },
        );
        // Refresh asset data
        const updated = await mux.video.assets.retrieve(
          selectedAsset.id as string,
        );
        setSelectedAsset(updated);
        setAssets((prev) =>
          prev.map((a) => (a.id === updated.id ? updated : a)),
        );
        showMessage(
          `Static rendition (${resolution}) creation started! It may take a few moments to be ready.`,
        );
      } catch (error) {
        showMessage(
          `Failed to create static rendition: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'error',
        );
      }
    },
    [mux, selectedAsset, showMessage],
  );

  const handleDeleteStaticRendition = useCallback(async () => {
    if (!selectedAsset || !selectedRendition?.id) return;
    try {
      setView('loading');
      await mux.video.assets.deleteStaticRendition(
        selectedAsset.id as string,
        selectedRendition.id,
      );
      // Refresh asset data
      const updated = await mux.video.assets.retrieve(
        selectedAsset.id as string,
      );
      setSelectedAsset(updated);
      setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setSelectedRendition(null);
      showMessage('Static rendition deleted!');
    } catch (error) {
      showMessage(
        `Failed to delete static rendition: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
    }
  }, [mux, selectedAsset, selectedRendition, showMessage]);

  // Global keyboard handler
  useKeyboard((key) => {
    if (
      view === 'message' &&
      (key.name === 'return' || key.name === 'escape')
    ) {
      if (selectedAsset) {
        setView('actions');
      } else {
        setView('list');
      }
    }
  });

  // Convert assets to list items
  const assetItems: SelectListItem<Asset | null>[] = assets.map((asset) => ({
    id: asset.id as string,
    label: formatAssetLabel(asset),
    description: formatAssetDescription(asset),
    value: asset,
  }));

  // Add "Load more" option if there are more assets
  if (hasMore) {
    assetItems.push({
      id: '__load_more__',
      label: loadingMore ? '⏳ Loading...' : '⏬ Load more assets...',
      description: '',
      value: null,
    });
  }

  // Asset actions
  const actions: Action[] = [
    { id: 'copy-stream', label: 'Copy stream URL (HLS)' },
    { id: 'copy-player', label: 'Copy player URL' },
    { id: 'create-playback', label: 'Create playback ID' },
    { id: 'delete-playback', label: 'Delete playback ID' },
    { id: 'view-renditions', label: 'View static renditions' },
    { id: 'create-rendition', label: 'Create static rendition' },
    { id: 'copy-rendition-url', label: 'Copy rendition download URL' },
    { id: 'delete-rendition', label: 'Delete static rendition' },
    { id: 'delete-asset', label: 'Delete asset', dangerous: true },
    { id: 'back', label: 'Back to list' },
  ];

  return (
    <box style={{ flexDirection: 'column', flexGrow: 1, padding: 1 }}>
      {view === 'loading' && (
        <box>
          <text>Loading...</text>
        </box>
      )}

      {view === 'list' && (
        <SelectList
          title={`Mux Assets (${assets.length}${hasMore ? '+' : ''})`}
          items={assetItems}
          onSelect={handleAssetSelect}
          onCancel={() => {
            renderer.destroy();
            process.exit(0);
          }}
        />
      )}

      {view === 'actions' && selectedAsset && (
        <AssetActionPanel
          asset={selectedAsset}
          actions={actions}
          onAction={handleAction}
          onCancel={() => {
            setSelectedAsset(null);
            setView('list');
          }}
        />
      )}

      {view === 'confirm-delete' && selectedAsset && (
        <ConfirmDialog
          title="Delete Asset"
          message={`Are you sure you want to delete asset ${selectedAsset.id}? This action cannot be undone.`}
          dangerous
          onConfirm={handleDeleteAsset}
          onCancel={() => setView('actions')}
        />
      )}

      {view === 'confirm-delete-playback' && selectedPlaybackId && (
        <ConfirmDialog
          title="Delete Playback ID"
          message={`Are you sure you want to delete playback ID ${selectedPlaybackId}?`}
          dangerous
          onConfirm={handleDeletePlaybackId}
          onCancel={() => setView('actions')}
        />
      )}

      {view === 'select-playback-id' && selectedAsset && (
        <SelectList
          title="Select Playback ID to Delete"
          items={(selectedAsset.playback_ids ?? []).map((p) => ({
            id: p.id as string,
            label: `${p.id} (${p.policy})`,
            value: p.id as string,
          }))}
          onSelect={(item) => {
            setSelectedPlaybackId(item.value as string);
            setView('confirm-delete-playback');
          }}
          onCancel={() => setView('actions')}
        />
      )}

      {view === 'select-playback-for-copy' && selectedAsset && copyType && (
        <SelectList
          title={`Select Playback ID for ${copyType === 'stream' ? 'Stream' : 'Player'} URL`}
          items={(selectedAsset.playback_ids ?? []).map((p) => ({
            id: p.id as string,
            label: `${p.id} (${p.policy === 'signed' ? '🔒 signed' : '🔓 public'})`,
            value: p,
          }))}
          onSelect={(item) => {
            handleCopyPlaybackId(item.value);
          }}
          onCancel={() => {
            setCopyType(null);
            setView('actions');
          }}
        />
      )}

      {view === 'select-playback-policy' && (
        <ActionMenu
          title="Select Playback Policy"
          actions={[
            {
              id: 'public',
              label: 'Public',
              description: 'Anyone with the URL can play',
            },
            {
              id: 'signed',
              label: 'Signed',
              description: 'Requires a signed token to play',
            },
          ]}
          onAction={(policy) =>
            handleCreatePlaybackId(policy as 'public' | 'signed')
          }
          onCancel={() => setView('actions')}
        />
      )}

      {view === 'view-static-renditions' && selectedAsset && (
        <StaticRenditionsView
          asset={selectedAsset}
          onBack={() => setView('actions')}
        />
      )}

      {view === 'select-resolution' && (
        <ActionMenu
          title="Select Resolution"
          actions={[
            {
              id: 'highest',
              label: 'Highest',
              description: 'Best quality based on source',
            },
            { id: '1080p', label: '1080p', description: 'Full HD (1920x1080)' },
            { id: '720p', label: '720p', description: 'HD (1280x720)' },
            { id: '480p', label: '480p', description: 'SD (854x480)' },
            { id: '360p', label: '360p', description: 'Low (640x360)' },
            {
              id: 'audio-only',
              label: 'Audio Only',
              description: 'Audio track only (m4a)',
            },
          ]}
          onAction={(res) => handleCreateStaticRendition(res as Resolution)}
          onCancel={() => setView('actions')}
        />
      )}

      {view === 'select-rendition-for-delete' && selectedAsset && (
        <SelectList
          title="Select Static Rendition to Delete"
          items={(selectedAsset.static_renditions?.files ?? [])
            .filter((f) => f.id)
            .map((f) => ({
              id: f.id as string,
              label: `${f.name ?? 'unknown'} [${f.status ?? 'unknown'}]`,
              description: formatRenditionDescription(f),
              value: f,
            }))}
          onSelect={(item) => {
            setSelectedRendition(item.value);
            setView('confirm-delete-rendition');
          }}
          onCancel={() => setView('actions')}
        />
      )}

      {view === 'confirm-delete-rendition' && selectedRendition && (
        <ConfirmDialog
          title="Delete Static Rendition"
          message={`Are you sure you want to delete static rendition ${selectedRendition.name}?`}
          dangerous
          onConfirm={handleDeleteStaticRendition}
          onCancel={() => {
            setSelectedRendition(null);
            setView('actions');
          }}
        />
      )}

      {view === 'select-rendition-for-copy' && selectedAsset && (
        <SelectList
          title="Select Static Rendition to Copy URL"
          items={(selectedAsset.static_renditions?.files ?? [])
            .filter((f) => f.status === 'ready' && f.id)
            .map((f) => ({
              id: f.id as string,
              label: `${f.name ?? 'unknown'}`,
              description: formatRenditionDescription(f),
              value: f,
            }))}
          onSelect={(item) => {
            copyRenditionUrl(item.value);
          }}
          onCancel={() => setView('actions')}
        />
      )}

      {view === 'message' && (
        <box
          style={{
            border: true,
            borderColor: messageType === 'success' ? '#66FF66' : '#FF6666',
            padding: 1,
          }}
        >
          <text
            style={{ fg: messageType === 'success' ? '#66FF66' : '#FF6666' }}
          >
            {message}
          </text>
          <text style={{ fg: '#888888', marginTop: 1 }}>
            Press Enter or Esc to continue
          </text>
        </box>
      )}
    </box>
  );
}

// Helper component showing asset details with action menu
function AssetActionPanel({
  asset,
  actions,
  onAction,
  onCancel,
}: {
  asset: Asset;
  actions: Action[];
  onAction: (actionId: string) => void;
  onCancel: () => void;
}) {
  return (
    <box style={{ flexDirection: 'column', flexGrow: 1 }}>
      {/* Asset details section */}
      <box style={{ border: true, padding: 1, marginBottom: 1 }}>
        <box style={{ flexDirection: 'column' }}>
          <text style={{ fg: '#00FFFF', marginBottom: 1 }}>
            Asset: {asset.id}
          </text>
          <box style={{ flexDirection: 'row', gap: 3 }}>
            <text>Status: {asset.status}</text>
            <text>
              Duration:{' '}
              {asset.duration ? `${asset.duration.toFixed(2)}s` : 'N/A'}
            </text>
            {asset.aspect_ratio && <text>Aspect: {asset.aspect_ratio}</text>}
            {asset.resolution_tier && <text>Res: {asset.resolution_tier}</text>}
          </box>
          {asset.passthrough && (
            <text style={{ fg: '#888888' }}>
              Passthrough: {asset.passthrough}
            </text>
          )}
          {asset.playback_ids && asset.playback_ids.length > 0 && (
            <box style={{ flexDirection: 'column', marginTop: 1 }}>
              <text style={{ fg: '#FFFF00' }}>Playback IDs:</text>
              {asset.playback_ids.map((p) => (
                <text key={p.id}>
                  {'  '}
                  {p.policy === 'signed' ? '🔒' : '🔓'} {p.id}
                </text>
              ))}
            </box>
          )}
        </box>
      </box>

      {/* Action menu */}
      <ActionMenu
        title="Actions"
        actions={actions}
        onAction={onAction}
        onCancel={onCancel}
      />
    </box>
  );
}

// Helper functions
function formatAssetLabel(asset: Asset): string {
  const status = (asset.status ?? 'unknown').padEnd(9);
  const duration = (
    asset.duration ? formatDuration(asset.duration) : '--:--'
  ).padStart(6);
  const policies = asset.playback_ids?.length
    ? asset.playback_ids
        .map((p) => (p.policy === 'signed' ? '🔒' : '🔓'))
        .join('')
    : '-';

  // Truncate ID if too long, keeping it recognizable
  const idDisplay =
    asset.id && asset.id.length > 24
      ? `${asset.id.slice(0, 12)}...${asset.id.slice(-8)}`
      : (asset.id ?? 'unknown');

  return `${idDisplay.padEnd(25)} ${status} ${duration}  ${policies}`;
}

function formatAssetDescription(asset: Asset): string {
  if (asset.passthrough) {
    return asset.passthrough;
  }
  return '';
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatRenditionDescription(file: StaticRenditionFile): string {
  const parts: string[] = [];
  if (file.width && file.height) {
    parts.push(`${file.width}x${file.height}`);
  }
  if (file.bitrate) {
    parts.push(formatBitrate(file.bitrate));
  }
  if (file.filesize) {
    parts.push(formatFilesize(file.filesize));
  }
  return parts.join(' | ');
}

function formatBitrate(bps: number): string {
  if (bps >= 1_000_000) {
    return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  }
  if (bps >= 1_000) {
    return `${(bps / 1_000).toFixed(0)} kbps`;
  }
  return `${bps} bps`;
}

function formatFilesize(bytes: string): string {
  const size = Number.parseInt(bytes, 10);
  if (Number.isNaN(size)) return bytes;

  if (size >= 1_000_000_000) {
    return `${(size / 1_000_000_000).toFixed(1)} GB`;
  }
  if (size >= 1_000_000) {
    return `${(size / 1_000_000).toFixed(1)} MB`;
  }
  if (size >= 1_000) {
    return `${(size / 1_000).toFixed(1)} KB`;
  }
  return `${size} B`;
}

function getStatusColor(status: string | undefined): {
  bg: string;
  fg: string;
} {
  switch (status) {
    case 'ready':
      return { bg: '#006600', fg: '#FFFFFF' };
    case 'preparing':
      return { bg: '#666600', fg: '#FFFFFF' };
    case 'skipped':
      return { bg: '#444444', fg: '#FFFFFF' };
    case 'errored':
      return { bg: '#660000', fg: '#FFFFFF' };
    default:
      return { bg: '#333333', fg: '#FFFFFF' };
  }
}

// Component to display static renditions
function StaticRenditionsView({
  asset,
  onBack,
}: {
  asset: Asset;
  onBack: () => void;
}) {
  const files = asset.static_renditions?.files ?? [];

  useKeyboard((key) => {
    if (key.name === 'escape' || key.name === 'q') {
      onBack();
    }
  });

  return (
    <box style={{ flexDirection: 'column', flexGrow: 1 }}>
      <box style={{ border: true, padding: 1 }}>
        <box style={{ flexDirection: 'column' }}>
          <text style={{ fg: '#00FFFF', marginBottom: 1 }}>
            Static Renditions for Asset: {asset.id}
          </text>

          {files.length === 0 ? (
            <text style={{ fg: '#888888' }}>No static renditions</text>
          ) : (
            <box style={{ flexDirection: 'column' }}>
              {/* Header */}
              <text style={{ fg: '#888888', marginBottom: 1 }}>
                {'Name'.padEnd(16)} {'Status'.padEnd(12)}{' '}
                {'Dimensions'.padEnd(12)} {'Bitrate'.padEnd(10)} Size
              </text>
              {/* Rendition rows */}
              {files.map((file) => {
                const colors = getStatusColor(file.status);
                const name = (file.name ?? 'unknown').padEnd(16);
                const dimensions =
                  file.width && file.height
                    ? `${file.width}x${file.height}`.padEnd(12)
                    : '-'.padEnd(12);
                const bitrate = file.bitrate
                  ? formatBitrate(file.bitrate).padEnd(10)
                  : '-'.padEnd(10);
                const filesize = file.filesize
                  ? formatFilesize(file.filesize)
                  : '-';

                return (
                  <box
                    key={file.id ?? file.name}
                    style={{ flexDirection: 'row' }}
                  >
                    <text>{name} </text>
                    <text style={{ bg: colors.bg, fg: colors.fg }}>
                      {` ${file.status ?? 'unknown'} `}
                    </text>
                    <text>
                      {' '.padEnd(12 - (file.status?.length ?? 7) - 2)}
                      {dimensions} {bitrate} {filesize}
                    </text>
                  </box>
                );
              })}
            </box>
          )}

          <text style={{ fg: '#888888', marginTop: 2 }}>
            Press Esc or q to go back
          </text>
        </box>
      </box>
    </box>
  );
}
