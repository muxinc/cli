import { Command } from '@cliffy/command';
import { wantsJson } from '@/lib/context.ts';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';

interface CancelOptions {
  json?: boolean;
}

export const cancelCommand = new Command()
  .description('Cancel a running Mux Robots job')
  .arguments('<job-id:string>')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: CancelOptions, jobId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();
      const job = await mux.robots.jobs.cancel(jobId);

      if (wantsJson(options)) {
        console.log(JSON.stringify(job, null, 2));
        return;
      }

      console.log(`Job ${job.id} cancelled`);
      console.log(`  Workflow: ${job.workflow}`);
      console.log(`  Status: ${job.status}`);
    } catch (error) {
      await handleCommandError(error, 'robots', 'cancel', options);
    }
  });
