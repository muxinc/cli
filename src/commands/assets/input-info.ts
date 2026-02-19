import { Command } from '@cliffy/command';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface InputInfoOptions {
  json?: boolean;
}

export const inputInfoCommand = new Command()
  .description('Retrieve input info for a Mux video asset')
  .arguments('<asset-id:string>')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: InputInfoOptions, assetId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const inputInfo = await mux.video.assets.retrieveInputInfo(assetId);

      if (options.json) {
        console.log(JSON.stringify(inputInfo, null, 2));
      } else {
        if (inputInfo.length === 0) {
          console.log('No input info available for this asset.');
          return;
        }

        for (let i = 0; i < inputInfo.length; i++) {
          const info = inputInfo[i];
          console.log(`Input ${i + 1}:`);

          if (info.file) {
            if (info.file.container_format) {
              console.log(`  Container: ${info.file.container_format}`);
            }

            if (info.file.tracks && info.file.tracks.length > 0) {
              console.log('  Tracks:');
              for (const track of info.file.tracks) {
                const parts = [`    - ${track.type}`];
                if (track.encoding) {
                  parts.push(`(${track.encoding})`);
                }
                if (track.width && track.height) {
                  parts.push(`${track.width}x${track.height}`);
                }
                if (track.frame_rate) {
                  parts.push(`${track.frame_rate}fps`);
                }
                if (track.duration) {
                  parts.push(`${track.duration.toFixed(2)}s`);
                }
                if (track.channels) {
                  parts.push(`${track.channels}ch`);
                }
                if (track.sample_rate) {
                  parts.push(`${track.sample_rate}Hz`);
                }
                console.log(parts.join(' '));
              }
            }
          }

          if (info.settings) {
            console.log(`  Settings: ${JSON.stringify(info.settings)}`);
          }

          if (i < inputInfo.length - 1) {
            console.log('');
          }
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (options.json) {
        console.error(JSON.stringify({ error: errorMessage }, null, 2));
      } else {
        console.error(`Error: ${errorMessage}`);
      }
      process.exit(1);
    }
  });
