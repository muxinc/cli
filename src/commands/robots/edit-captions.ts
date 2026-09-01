import { Command } from '@cliffy/command';
import type {
  EditCaptionCreateParams,
  EditCaptionsJobParameters,
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

type CensorMode = NonNullable<
  EditCaptionsJobParameters.AutoCensorProfanity['mode']
>;
const VALID_CENSOR_MODES: CensorMode[] = ['blank', 'remove', 'mask'];

interface EditCaptionsOptions {
  trackId?: string;
  replace?: string[];
  caseSensitive?: boolean;
  censorProfanity?: boolean;
  censorMode?: CensorMode;
  deleteOriginalTrack?: boolean;
  trackNameSuffix?: string;
  upload?: boolean;
  passthrough?: string;
  file?: string;
  wait?: boolean;
  json?: boolean;
}

export function parseReplacement(
  value: string,
  caseSensitive?: boolean,
): EditCaptionsJobParameters.Replacement {
  const separator = value.indexOf('=');
  if (separator <= 0) {
    throw new Error(
      `Invalid --replace value: "${value}". Use the form "find=replace".`,
    );
  }
  const replacement: EditCaptionsJobParameters.Replacement = {
    find: value.slice(0, separator),
    replace: value.slice(separator + 1),
  };
  if (caseSensitive !== undefined) {
    replacement.case_sensitive = caseSensitive;
  }
  return replacement;
}

// biome-ignore lint/suspicious/noExplicitAny: Cliffy's chained types are too complex for TS to infer
export const editCaptionsCommand: Command<any> = new Command()
  .description(
    'Create a job to edit a caption track with find/replace rules or profanity censoring',
  )
  .arguments('<asset-id:string>')
  .option('--track-id <trackId:string>', 'Caption track ID to edit')
  .option(
    '--replace <replacement:string>',
    'Find/replace rule in the form "find=replace" (repeatable)',
    { collect: true },
  )
  .option(
    '--case-sensitive',
    'Make --replace rules match case-sensitively (default: insensitive)',
  )
  .option(
    '--censor-profanity',
    'Automatically censor profanity in the captions',
  )
  .option(
    '--censor-mode <censorMode:string>',
    'How to censor profanity (blank, remove, mask); implies --censor-profanity',
    {
      value: (value: string): CensorMode => {
        if (!VALID_CENSOR_MODES.includes(value as CensorMode)) {
          throw new Error(
            `Invalid --censor-mode: ${value}. Must be one of: ${VALID_CENSOR_MODES.join(', ')}`,
          );
        }
        return value as CensorMode;
      },
    },
  )
  .option(
    '--delete-original-track',
    'Delete the original caption track after the edited track is created',
  )
  .option(
    '--track-name-suffix <trackNameSuffix:string>',
    'Suffix appended to the edited track name',
  )
  .option(
    '--no-upload',
    'Do not upload the edited VTT to Mux (default: uploads)',
  )
  .option(
    '--passthrough <passthrough:string>',
    'Arbitrary metadata returned in API responses (max 255 chars)',
  )
  .option(
    '-f, --file <path:string>',
    'JSON config file with the full parameters object (track_id, replacements, auto_censor_profanity, etc.)',
  )
  .option(
    '--wait',
    'Wait for the job to reach a terminal status (polls up to 15 minutes)',
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: EditCaptionsOptions, assetId: string) => {
    try {
      const hasReplacements =
        options.replace !== undefined && options.replace.length > 0;
      const hasShapeFlags =
        options.trackId !== undefined ||
        hasReplacements ||
        options.caseSensitive !== undefined ||
        options.censorProfanity !== undefined ||
        options.censorMode !== undefined ||
        options.deleteOriginalTrack !== undefined ||
        options.trackNameSuffix !== undefined ||
        options.upload === false;

      if (options.file && hasShapeFlags) {
        throw new Error(FILE_MUTEX_MSG);
      }

      let parameters: EditCaptionsJobParameters;
      if (options.file) {
        parameters = await loadJobParameters<EditCaptionsJobParameters>(
          options.file,
          assetId,
        );
      } else {
        if (!options.trackId) {
          throw new Error('--track-id is required (or provide via --file)');
        }
        const wantsCensoring =
          options.censorProfanity || options.censorMode !== undefined;
        if (!hasReplacements && !wantsCensoring) {
          throw new Error(
            'Provide at least one edit: --replace, --censor-profanity, or a --file with parameters.',
          );
        }
        parameters = {
          asset_id: assetId,
          track_id: options.trackId,
        };
        if (hasReplacements) {
          parameters.replacements = (options.replace ?? []).map((value) =>
            parseReplacement(value, options.caseSensitive),
          );
        }
        if (wantsCensoring) {
          const censor: EditCaptionsJobParameters.AutoCensorProfanity = {};
          if (options.censorMode !== undefined)
            censor.mode = options.censorMode;
          parameters.auto_censor_profanity = censor;
        }
        if (options.deleteOriginalTrack !== undefined)
          parameters.delete_original_track = options.deleteOriginalTrack;
        if (options.trackNameSuffix !== undefined)
          parameters.track_name_suffix = options.trackNameSuffix;
        if (options.upload === false) parameters.upload_to_mux = false;
      }

      const body: EditCaptionCreateParams = { parameters };
      if (options.passthrough !== undefined)
        body.passthrough = options.passthrough;

      const mux = await createAuthenticatedMuxClient();
      let job = await mux.robots.jobs.editCaptions.create(body);

      if (!wantsJson(options)) {
        console.log('Edit captions job created');
        console.log(`  Job ID: ${job.id}`);
        console.log(`  Status: ${job.status}`);
      }

      if (options.wait) {
        job = (await pollForRobotsJob(mux, 'edit-captions', job.id, {
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
      await handleCommandError(error, 'robots', 'edit-captions', options);
    }
  });
