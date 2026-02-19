import { Command } from '@cliffy/command';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface ListOptions {
  limit?: number;
  page?: number;
  json?: boolean;
  compact?: boolean;
}

export const listCommand = new Command()
  .description('List transcription vocabularies')
  .option('--limit <limit:number>', 'Number of results to return', {
    default: 25,
  })
  .option('--page <page:number>', 'Page number for pagination', { default: 1 })
  .option('--json', 'Output JSON instead of pretty format')
  .option('--compact', 'Output one line per vocabulary (grep-friendly)')
  .action(async (options: ListOptions) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const vocabularies = await mux.video.transcriptionVocabularies.list({
        limit: options.limit,
        page: options.page,
      });

      if (options.json) {
        console.log(JSON.stringify(vocabularies, null, 2));
        return;
      }

      const data = vocabularies.data ?? [];

      if (data.length === 0) {
        console.log('No transcription vocabularies found.');
        return;
      }

      if (options.compact) {
        for (const vocab of data) {
          console.log(`${vocab.id}\t${vocab.name ?? '-'}`);
        }
      } else {
        for (const vocab of data) {
          console.log(`Vocabulary ID: ${vocab.id}`);
          if (vocab.name) {
            console.log(`  Name: ${vocab.name}`);
          }
          if (vocab.phrases) {
            console.log(`  Phrases: ${vocab.phrases.join(', ')}`);
          }
          console.log('');
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
