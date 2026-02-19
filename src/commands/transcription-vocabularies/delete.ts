import { Command } from '@cliffy/command';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';
import { confirmPrompt } from '../../lib/prompt.ts';

interface DeleteOptions {
  force?: boolean;
  json?: boolean;
}

export const deleteCommand = new Command()
  .description(
    'Permanently delete a transcription vocabulary (cannot be undone)',
  )
  .arguments('<vocabulary-id:string>')
  .option('-f, --force', 'Skip confirmation prompt')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: DeleteOptions, vocabularyId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      if (!options.force) {
        if (options.json) {
          throw new Error(
            'Deletion requires --force flag when using --json output',
          );
        }

        const confirmed = await confirmPrompt({
          message: `Are you sure you want to delete transcription vocabulary ${vocabularyId}?`,
          default: false,
        });

        if (!confirmed) {
          console.log('Deletion cancelled.');
          return;
        }
      }

      await mux.video.transcriptionVocabularies.delete(vocabularyId);

      if (options.json) {
        console.log(JSON.stringify({ success: true, vocabularyId }, null, 2));
      } else {
        console.log(
          `Transcription vocabulary ${vocabularyId} deleted successfully`,
        );
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
