import { Asset } from '@mux/mux-node';
import { flags } from '@oclif/command';
import CommandBase from './base';

export default abstract class AssetCommandBase extends CommandBase {
  static flags = {
    private: flags.boolean({
      char: 'p',
      description: 'add a private playback policy to the created asset',
    }),
  };

  playbackUrl(asset: Asset) {
    const publicPlaybackId = (asset.playback_ids ?? []).find(
      p => p.policy === 'public'
    );
    if (!publicPlaybackId) {
      return 'No public playback policies found!';
    }

    return `https://mux-playground.now.sh/videojs?playback_id=${
      publicPlaybackId.id
    }`;
  }

  pollAsset(assetId: string): Promise<Asset> {
    return new Promise((resolve, reject) => {
      const poll = () =>
        setTimeout(async () => {
          try {
            const asset = await this.Video.Assets.get(assetId);
            if (asset.status === 'ready') {
              return resolve(asset);
            } else if (asset.status === 'errored') {
              return reject(asset);
            }

            poll();
          } catch (err) {
            reject(err);
          }
        }, 500);

      poll();
    });
  }
}
