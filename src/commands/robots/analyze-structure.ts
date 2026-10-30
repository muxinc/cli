import { Command } from '@cliffy/command';
import type {
  AnalyzeStructureCreateParams,
  AnalyzeStructureJobParameters,
  AnalyzeStructureOutputSteering,
} from '@mux/ts/resources/robots/jobs';
import { wantsJson } from '@/lib/context.ts';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';
import {
  assertJobCompleted,
  FILE_MUTEX_MSG,
  loadJobParameters,
  pollForRobotsJob,
} from './_shared.ts';

type Granularity = NonNullable<AnalyzeStructureOutputSteering['granularity']>;
const VALID_GRANULARITIES: Granularity[] = ['coarse', 'balanced', 'fine'];

interface AnalyzeStructureOptions {
  languageCode?: string;
  audience?: string;
  brandTerm?: string[];
  granularity?: Granularity;
  startTime?: number;
  endTime?: number;
  passthrough?: string;
  file?: string;
  wait?: boolean;
  json?: boolean;
}

// biome-ignore lint/suspicious/noExplicitAny: Cliffy's chained types are too complex for TS to infer
export const analyzeStructureCommand: Command<any> = new Command()
  .description(
    'Create a job to analyze scenes, chapters, and the structure of a video',
  )
  .arguments('<asset-id:string>')
  .option(
    '--language-code <languageCode:string>',
    'BCP 47 language code of the caption track to analyze',
  )
  .option(
    '--audience <audience:string>',
    'Intended audience used as best-effort model guidance',
  )
  .option(
    '--brand-term <brandTerm:string>',
    'Preferred brand or domain term to use when supported (repeatable)',
    { collect: true },
  )
  .option(
    '--granularity <granularity:string>',
    'Scene and chapter density (coarse, balanced, fine)',
    {
      value: (value: string): Granularity => {
        if (!VALID_GRANULARITIES.includes(value as Granularity)) {
          throw new Error(
            `Invalid --granularity: ${value}. Must be one of: ${VALID_GRANULARITIES.join(', ')}`,
          );
        }
        return value as Granularity;
      },
    },
  )
  .option(
    '--start-time <startTime:number>',
    'Start of the execution window in seconds on the asset timeline',
  )
  .option(
    '--end-time <endTime:number>',
    'End of the execution window in seconds on the asset timeline',
  )
  .option(
    '--passthrough <passthrough:string>',
    'Arbitrary metadata returned in API responses (max 255 chars)',
  )
  .option(
    '-f, --file <path:string>',
    'JSON config file with the full parameters object (language_code, output_steering, etc.)',
  )
  .option(
    '--wait',
    'Wait for the job to reach a terminal status (polls up to 15 minutes)',
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: AnalyzeStructureOptions, assetId: string) => {
    try {
      const outputSteering = buildOutputSteering(options);
      const hasShapeFlags =
        options.languageCode !== undefined || outputSteering !== undefined;

      if (options.file && hasShapeFlags) {
        throw new Error(FILE_MUTEX_MSG);
      }

      let parameters: AnalyzeStructureJobParameters;
      if (options.file) {
        parameters = await loadJobParameters<AnalyzeStructureJobParameters>(
          options.file,
          assetId,
        );
      } else {
        parameters = { asset_id: assetId };
        if (options.languageCode !== undefined)
          parameters.language_code = options.languageCode;
        if (outputSteering !== undefined)
          parameters.output_steering = outputSteering;
      }

      const body: AnalyzeStructureCreateParams = { parameters };
      if (options.passthrough !== undefined)
        body.passthrough = options.passthrough;

      const mux = await createAuthenticatedMuxClient();
      let job = await mux.robots.jobs.analyzeStructure.create(body);

      if (!wantsJson(options)) {
        console.log('Analyze structure job created');
        console.log(`  Job ID: ${job.id}`);
        console.log(`  Status: ${job.status}`);
      }

      if (options.wait) {
        job = (await pollForRobotsJob(mux, 'analyze-structure', job.id, {
          json: wantsJson(options),
        })) as typeof job;
      }

      if (wantsJson(options)) {
        console.log(JSON.stringify(job, null, 2));
      } else if (options.wait && job.outputs) {
        console.log('Outputs:');
        console.log(JSON.stringify(job.outputs, null, 2));
      }

      if (options.wait) assertJobCompleted(job);
    } catch (error) {
      await handleCommandError(error, 'robots', 'analyze-structure', options);
    }
  });

function buildOutputSteering(
  options: AnalyzeStructureOptions,
): AnalyzeStructureOutputSteering | undefined {
  const steering: AnalyzeStructureOutputSteering = {};
  if (options.audience !== undefined) steering.audience = options.audience;
  if (options.brandTerm !== undefined && options.brandTerm.length > 0)
    steering.brand_terms = options.brandTerm;
  if (options.granularity !== undefined)
    steering.granularity = options.granularity;
  if (options.startTime !== undefined || options.endTime !== undefined) {
    steering.scope = {};
    if (options.startTime !== undefined)
      steering.scope.start_time = options.startTime;
    if (options.endTime !== undefined)
      steering.scope.end_time = options.endTime;
  }
  return Object.keys(steering).length > 0 ? steering : undefined;
}
