import { Command } from '@cliffy/command';
import type {
  GeneratePremiumCaptionCreateParams,
  GeneratePremiumCaptionsJobParameters,
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

interface GeneratePremiumCaptionsOptions {
  languageCode?: string;
  includeSpeakers?: boolean;
  includeWords?: boolean;
  phrase?: string[];
  replaceExisting?: boolean;
  trackName?: string;
  upload?: boolean;
  passthrough?: string;
  file?: string;
  wait?: boolean;
  json?: boolean;
}

// biome-ignore lint/suspicious/noExplicitAny: Cliffy's chained types are too complex for TS to infer
export const generatePremiumCaptionsCommand: Command<any> = new Command()
  .description(
    'Create a job to generate high-accuracy premium captions for a video',
  )
  .arguments('<asset-id:string>')
  .option(
    '--language-code <languageCode:string>',
    'BCP 47 language code of the spoken audio (auto-detected when omitted)',
  )
  .option(
    '--include-speakers',
    'Include speaker labels in the generated captions',
  )
  .option('--include-words', 'Include word-level timing in the output')
  .option(
    '--phrase <phrase:string>',
    'Domain-specific phrase to boost recognition accuracy (repeatable)',
    { collect: true },
  )
  .option(
    '--replace-existing',
    'Replace an existing generated caption track in the same language',
  )
  .option(
    '--track-name <trackName:string>',
    'Name for the generated caption track',
  )
  .option(
    '--no-upload',
    'Do not upload the generated captions to Mux (default: uploads)',
  )
  .option(
    '--passthrough <passthrough:string>',
    'Arbitrary metadata returned in API responses (max 255 chars)',
  )
  .option(
    '-f, --file <path:string>',
    'JSON config file with the full parameters object (language_code, phrases, etc.)',
  )
  .option(
    '--wait',
    'Wait for the job to reach a terminal status (polls up to 15 minutes)',
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: GeneratePremiumCaptionsOptions, assetId: string) => {
    try {
      const hasShapeFlags =
        options.languageCode !== undefined ||
        options.includeSpeakers !== undefined ||
        options.includeWords !== undefined ||
        (options.phrase !== undefined && options.phrase.length > 0) ||
        options.replaceExisting !== undefined ||
        options.trackName !== undefined ||
        options.upload === false;

      if (options.file && hasShapeFlags) {
        throw new Error(FILE_MUTEX_MSG);
      }

      let parameters: GeneratePremiumCaptionsJobParameters;
      if (options.file) {
        parameters =
          await loadJobParameters<GeneratePremiumCaptionsJobParameters>(
            options.file,
            assetId,
          );
      } else {
        parameters = { asset_id: assetId };
        if (options.languageCode !== undefined)
          parameters.language_code = options.languageCode;
        if (options.includeSpeakers !== undefined)
          parameters.include_speakers = options.includeSpeakers;
        if (options.includeWords !== undefined)
          parameters.include_words = options.includeWords;
        if (options.phrase !== undefined && options.phrase.length > 0)
          parameters.phrases = options.phrase;
        if (options.replaceExisting !== undefined)
          parameters.replace_existing = options.replaceExisting;
        if (options.trackName !== undefined)
          parameters.track_name = options.trackName;
        if (options.upload === false) parameters.upload_to_mux = false;
      }

      const body: GeneratePremiumCaptionCreateParams = { parameters };
      if (options.passthrough !== undefined)
        body.passthrough = options.passthrough;

      const mux = await createAuthenticatedMuxClient();
      let job = await mux.robots.jobs.generatePremiumCaptions.create(body);

      if (!wantsJson(options)) {
        console.log('Generate premium captions job created');
        console.log(`  Job ID: ${job.id}`);
        console.log(`  Status: ${job.status}`);
      }

      if (options.wait) {
        job = (await pollForRobotsJob(
          mux,
          'generate-premium-captions',
          job.id,
          { json: wantsJson(options) },
        )) as typeof job;
      }

      if (wantsJson(options)) {
        console.log(JSON.stringify(job, null, 2));
      } else if (options.wait && job.outputs) {
        console.log('Outputs:');
        console.log(JSON.stringify(job.outputs, null, 2));
      }

      if (options.wait) assertJobCompleted(job);
    } catch (error) {
      await handleCommandError(
        error,
        'robots',
        'generate-premium-captions',
        options,
      );
    }
  });
