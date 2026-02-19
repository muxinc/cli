import { Command } from '@cliffy/command';
import { createAuthenticatedMuxClient } from '../../lib/mux.ts';

interface GetOptions {
  json?: boolean;
}

export const getCommand = new Command()
  .description('Get details about a specific annotation')
  .arguments('<annotation-id:string>')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: GetOptions, annotationId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const annotation = await mux.data.annotations.retrieve(annotationId);

      if (options.json) {
        console.log(JSON.stringify(annotation, null, 2));
      } else {
        console.log(`Annotation ID: ${annotation.id}`);
        console.log(`  Date: ${annotation.date ?? '-'}`);
        console.log(`  Note: ${annotation.note ?? '-'}`);
        if (annotation.sub_property_id) {
          console.log(`  Sub-property ID: ${annotation.sub_property_id}`);
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
