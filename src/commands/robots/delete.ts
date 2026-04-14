import { Command } from '@cliffy/command';
import { handleCommandError } from '@/lib/errors.ts';
import { confirmPrompt } from '@/lib/prompt.ts';
import { deleteJob } from '@/lib/robots.ts';

interface DeleteOptions {
  force?: boolean;
  json?: boolean;
}

export const deleteCommand = new Command()
  .description('Permanently delete a Mux Robots job (cannot be undone)')
  .arguments('<job-id:string>')
  .option('-f, --force', 'Skip confirmation prompt')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: DeleteOptions, jobId: string) => {
    try {
      if (!options.force) {
        if (options.json) {
          throw new Error(
            'Deletion requires --force flag when using --json output',
          );
        }

        const confirmed = await confirmPrompt({
          message: `Are you sure you want to delete job ${jobId}?`,
          default: false,
        });

        if (!confirmed) {
          console.log('Deletion cancelled.');
          return;
        }
      }

      await deleteJob(jobId);

      if (options.json) {
        console.log(JSON.stringify({ success: true, jobId }, null, 2));
      } else {
        console.log(`Job ${jobId} deleted successfully`);
      }
    } catch (error) {
      await handleCommandError(error, 'robots', 'delete', options);
    }
  });
