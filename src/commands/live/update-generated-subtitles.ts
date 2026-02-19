import { Command } from '@cliffy/command';
import { formatLiveStream } from '../../lib/formatters.ts';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface UpdateGeneratedSubtitlesOptions {
  languageCode?: string;
  name?: string;
  passthrough?: string;
  transcriptionVocabularyIds?: string[];
  clear?: boolean;
  json?: boolean;
}

export const updateGeneratedSubtitlesCommand = new Command()
  .description(
    'Update generated subtitle (ASR) configuration for a live stream',
  )
  .arguments('<stream-id:string>')
  .option(
    '--language-code <languageCode:string>',
    'Language for generated subtitles (e.g., en, es, fr, de, pt, it)',
  )
  .option('--name <name:string>', 'Name for the subtitle track')
  .option(
    '--passthrough <passthrough:string>',
    'Passthrough metadata (max 255 characters)',
  )
  .option(
    '--transcription-vocabulary-ids <id:string>',
    'Transcription vocabulary IDs to use',
    { collect: true },
  )
  .option('--clear', 'Remove all generated subtitle configuration')
  .option('--json', 'Output JSON instead of pretty format')
  .action(
    async (options: UpdateGeneratedSubtitlesOptions, streamId: string) => {
      try {
        const mux = await createAuthenticatedMuxClient();

        let generatedSubtitles: Array<Record<string, unknown>> = [];

        if (!options.clear) {
          const subtitle: Record<string, unknown> = {};

          if (options.languageCode !== undefined) {
            subtitle.language_code = options.languageCode;
          }
          if (options.name !== undefined) {
            subtitle.name = options.name;
          }
          if (options.passthrough !== undefined) {
            subtitle.passthrough = options.passthrough;
          }
          if (
            options.transcriptionVocabularyIds !== undefined &&
            options.transcriptionVocabularyIds.length > 0
          ) {
            subtitle.transcription_vocabulary_ids =
              options.transcriptionVocabularyIds;
          }

          if (Object.keys(subtitle).length > 0) {
            generatedSubtitles = [subtitle];
          }
        }

        const stream = await mux.video.liveStreams.updateGeneratedSubtitles(
          streamId,
          { generated_subtitles: generatedSubtitles as never },
        );

        if (options.json) {
          console.log(JSON.stringify(stream, null, 2));
        } else {
          if (options.clear) {
            console.log('Generated subtitle configuration cleared.\n');
          } else {
            console.log('Generated subtitle configuration updated.\n');
          }
          formatLiveStream(stream);
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
    },
  );
