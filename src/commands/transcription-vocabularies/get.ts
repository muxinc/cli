import { Command } from '@cliffy/command';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface GetOptions {
  json?: boolean;
}

export const getCommand = new Command()
  .description('Get details about a specific transcription vocabulary')
  .arguments('<vocabulary-id:string>')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: GetOptions, vocabularyId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const vocabulary =
        await mux.video.transcriptionVocabularies.retrieve(vocabularyId);

      if (options.json) {
        console.log(JSON.stringify(vocabulary, null, 2));
      } else {
        console.log(`Vocabulary ID: ${vocabulary.id}`);
        if (vocabulary.name) {
          console.log(`Name: ${vocabulary.name}`);
        }
        console.log(`Created: ${vocabulary.created_at}`);
        console.log(`Updated: ${vocabulary.updated_at}`);
        if (vocabulary.phrases) {
          console.log(`Phrases: ${vocabulary.phrases.join(', ')}`);
        }
        if (vocabulary.passthrough) {
          console.log(`Passthrough: ${vocabulary.passthrough}`);
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
