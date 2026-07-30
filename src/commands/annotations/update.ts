import { Command } from '@cliffy/command';
import { wantsJson } from '@/lib/context.ts';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';

interface UpdateOptions {
  date: number;
  note: string;
  subPropertyId?: string;
  json?: boolean;
}

export const updateCommand = new Command()
  .description('Update an annotation in Mux Data')
  .arguments('<annotation-id:string>')
  .option('--date <date:number>', 'Unix timestamp for the annotation date', {
    required: true,
  })
  .option('--note <note:string>', 'Note text for the annotation', {
    required: true,
  })
  .option(
    '--sub-property-id <subPropertyId:string>',
    'Sub-property ID to associate with the annotation',
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: UpdateOptions, annotationId: string) => {
    try {
      const mux = await createAuthenticatedMuxClient();

      const body: Record<string, unknown> = {
        date: options.date,
        note: options.note,
      };

      if (options.subPropertyId) {
        body.sub_property_id = options.subPropertyId;
      }

      const annotation = await mux.data.annotations.update(
        annotationId,
        body as never,
      );

      if (wantsJson(options)) {
        console.log(JSON.stringify(annotation, null, 2));
      } else {
        console.log('Annotation updated successfully.');
        console.log(`  ID: ${annotation.id}`);
        console.log(`  Date: ${annotation.date}`);
        console.log(`  Note: ${annotation.note}`);
      }
    } catch (error) {
      await handleCommandError(error, 'annotations', 'update', options);
    }
  });
