import { Command } from '@cliffy/command';
import { handleCommandError } from '@/lib/errors.ts';
import { cancelJob } from '@/lib/robots.ts';

interface CancelOptions {
  json?: boolean;
}

export const cancelCommand = new Command()
  .description('Cancel a running Mux Robots job')
  .arguments('<job-id:string>')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: CancelOptions, jobId: string) => {
    try {
      const result = await cancelJob(jobId);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      const job = result.data;
      console.log(`Job ${job.id} cancelled`);
      console.log(`  Workflow: ${job.workflow}`);
      console.log(`  Status: ${job.status}`);
    } catch (error) {
      await handleCommandError(error, 'robots', 'cancel', options);
    }
  });
