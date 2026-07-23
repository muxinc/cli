import { Command } from '@cliffy/command';
import { wantsJson } from '@/lib/context.ts';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';
import { confirmPrompt } from '@/lib/prompt.ts';

interface DeleteOptions {
  force?: boolean;
  json?: boolean;
}

export const deleteCommand = new Command()
  .description(
    'Permanently delete an annotation from Mux Data (cannot be undone)',
  )
  .arguments('<annotation-id:string>')
  .option('-f, --force', 'Skip confirmation prompt')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: DeleteOptions, annotationId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      // Confirm deletion unless --force flag is provided
      if (!options.force) {
        // For JSON mode, require explicit --force flag for safety
        if (wantsJson(options)) {
          throw new Error(
            'Deletion requires the --force flag with --json or in agent mode',
          );
        }

        const confirmed = await confirmPrompt({
          message: `Are you sure you want to delete annotation ${annotationId}?`,
          default: false,
        });

        if (!confirmed) {
          console.log('Deletion cancelled.');
          return;
        }
      }

      await mux.data.annotations.delete(annotationId);

      if (wantsJson(options)) {
        console.log(JSON.stringify({ success: true, annotationId }, null, 2));
      } else {
        console.log(`Annotation ${annotationId} deleted successfully.`);
      }
    } catch (error) {
      await handleCommandError(error, 'annotations', 'delete', options);
    }
  });
