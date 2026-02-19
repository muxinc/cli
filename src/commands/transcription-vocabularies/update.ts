import { Command } from '@cliffy/command';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface UpdateOptions {
  phrase: string[];
  name?: string;
  passthrough?: string;
  json?: boolean;
}

export const updateCommand = new Command()
  .description('Update a transcription vocabulary (replaces all phrases)')
  .arguments('<vocabulary-id:string>')
  .option(
    '--phrase <phrase:string>',
    'Phrase to include in the vocabulary. Can be specified multiple times. Replaces all existing phrases.',
    { collect: true, required: true },
  )
  .option('--name <name:string>', 'Name for the vocabulary')
  .option(
    '--passthrough <passthrough:string>',
    'Passthrough metadata (max 255 characters)',
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: UpdateOptions, vocabularyId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const params: {
        phrases: string[];
        name?: string;
        passthrough?: string;
      } = {
        phrases: options.phrase,
      };

      if (options.name !== undefined) {
        params.name = options.name;
      }
      if (options.passthrough !== undefined) {
        params.passthrough = options.passthrough;
      }

      const vocabulary = await mux.video.transcriptionVocabularies.update(
        vocabularyId,
        params,
      );

      if (options.json) {
        console.log(JSON.stringify(vocabulary, null, 2));
      } else {
        console.log('Transcription vocabulary updated successfully');
        console.log(`  ID: ${vocabulary.id}`);
        if (vocabulary.name) {
          console.log(`  Name: ${vocabulary.name}`);
        }
        if (vocabulary.phrases) {
          console.log(`  Phrases: ${vocabulary.phrases.join(', ')}`);
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
