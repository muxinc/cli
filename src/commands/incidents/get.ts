import { Command } from '@cliffy/command';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface GetOptions {
  json?: boolean;
}

export const getCommand = new Command()
  .description('Get details about a specific incident')
  .arguments('<incident-id:string>')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: GetOptions, incidentId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const response = await mux.data.incidents.retrieve(incidentId);
      const incident = response.data;

      if (options.json) {
        console.log(JSON.stringify(response, null, 2));
      } else {
        console.log(`Incident ID: ${incident.id}`);
        console.log(`  Severity: ${incident.severity ?? '-'}`);
        console.log(`  Status: ${incident.status ?? '-'}`);
        console.log(`  Description: ${incident.description ?? '-'}`);
        console.log(
          `  Error Description: ${incident.error_description ?? '-'}`,
        );
        console.log(`  Impact: ${incident.impact ?? '-'}`);
        console.log(`  Measurement: ${incident.measurement ?? '-'}`);
        console.log(`  Measured Value: ${incident.measured_value ?? '-'}`);
        console.log(`  Started At: ${incident.started_at ?? '-'}`);
        console.log(`  Resolved At: ${incident.resolved_at ?? '-'}`);
        console.log(`  Affected Views: ${incident.affected_views ?? '-'}`);
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
