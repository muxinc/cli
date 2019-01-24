declare module '@mux/mux-node';
declare module 'clipboardy';
declare module 'inquirer';

declare type PlaybackPolicyType = 'public' | 'signed';

declare interface IMuxAssetBody {
  input?: string;
  playback_policies: PlaybackPolicyType[];
}

declare interface IMuxUploadBody {
  new_asset_settings: IMuxAssetBody;
}

declare interface IPlaybackPolicy {
  id: string;
  policy: PlaybackPolicyType;
}

declare interface IMuxAsset {
  id: string;
  playback_ids: IPlaybackPolicy[];
}

declare interface IMuxUpload {
  asset_id: string;
}
