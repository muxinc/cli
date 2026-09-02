import { readFile } from 'node:fs/promises';
import type Mux from '@mux/ts';
import type {
  AskQuestionsJob,
  EditCaptionsJob,
  FindBestThumbnailsJob,
  FindKeyMomentsJob,
  FindScenesJob,
  GenerateChaptersJob,
  GenerateEngagementInsightsJob,
  GeneratePremiumCaptionsJob,
  ModerateJob,
  SummarizeJob,
  TranslateAudioJob,
  TranslateCaptionsJob,
} from '@mux/ts/resources/robots/jobs';

export type AnyRobotsJob =
  | AskQuestionsJob
  | EditCaptionsJob
  | FindBestThumbnailsJob
  | FindKeyMomentsJob
  | FindScenesJob
  | GenerateChaptersJob
  | GenerateEngagementInsightsJob
  | GeneratePremiumCaptionsJob
  | ModerateJob
  | SummarizeJob
  | TranslateAudioJob
  | TranslateCaptionsJob;

export type RobotsWorkflow = AnyRobotsJob['workflow'];

export const FILE_MUTEX_MSG =
  '--file cannot be combined with other parameter flags. Use one or the other.';

const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'errored']);

export function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}

export async function loadJobParameters<T extends { asset_id?: string }>(
  filePath: string,
  assetIdFromPositional: string,
): Promise<T> {
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Config file not found: ${filePath}`);
    }
    throw err;
  }

  let parsed: T;
  try {
    parsed = JSON.parse(content) as T;
  } catch (err) {
    throw new Error(
      `Invalid JSON in config file ${filePath}: ${(err as Error).message}`,
    );
  }

  if (parsed.asset_id && parsed.asset_id !== assetIdFromPositional) {
    throw new Error(
      `asset_id in config file (${parsed.asset_id}) does not match positional argument (${assetIdFromPositional}).`,
    );
  }
  parsed.asset_id = assetIdFromPositional;
  return parsed;
}

export function retrieveRobotsJob(
  mux: Mux,
  workflow: RobotsWorkflow,
  jobId: string,
): Promise<AnyRobotsJob> {
  switch (workflow) {
    case 'ask-questions':
      return mux.robots.jobs.askQuestions.retrieve(jobId);
    case 'edit-captions':
      return mux.robots.jobs.editCaptions.retrieve(jobId);
    case 'find-best-thumbnails':
      return mux.robots.jobs.findBestThumbnails.retrieve(jobId);
    case 'find-key-moments':
      return mux.robots.jobs.findKeyMoments.retrieve(jobId);
    case 'find-scenes':
      return mux.robots.jobs.findScenes.retrieve(jobId);
    case 'generate-chapters':
      return mux.robots.jobs.generateChapters.retrieve(jobId);
    case 'generate-engagement-insights':
      return mux.robots.jobs.generateEngagementInsights.retrieve(jobId);
    case 'generate-premium-captions':
      return mux.robots.jobs.generatePremiumCaptions.retrieve(jobId);
    case 'moderate':
      return mux.robots.jobs.moderate.retrieve(jobId);
    case 'summarize':
      return mux.robots.jobs.summarize.retrieve(jobId);
    case 'translate-audio':
      return mux.robots.jobs.translateAudio.retrieve(jobId);
    case 'translate-captions':
      return mux.robots.jobs.translateCaptions.retrieve(jobId);
  }
}

export function assertJobCompleted(job: AnyRobotsJob): void {
  if (job.status === 'completed') return;
  const details = job.errors?.length
    ? `: ${job.errors.map((e) => `${e.type}: ${e.message}`).join('; ')}`
    : '';
  throw new Error(`Job ${job.id} ended with status "${job.status}"${details}`);
}

export interface PollOptions {
  json: boolean;
  pollIntervalMs?: number;
}

export async function pollForRobotsJob(
  mux: Mux,
  workflow: RobotsWorkflow,
  jobId: string,
  { json, pollIntervalMs = 3000 }: PollOptions,
): Promise<AnyRobotsJob> {
  const MAX_POLL_TIME_MS = 15 * 60 * 1000;
  const start = Date.now();

  if (!json) {
    process.stderr.write('Waiting for job to complete');
  }

  while (Date.now() - start < MAX_POLL_TIME_MS) {
    const job = await retrieveRobotsJob(mux, workflow, jobId);
    if (isTerminalStatus(job.status)) {
      if (!json) {
        process.stderr.write(` ${job.status}!\n`);
      }
      return job;
    }
    if (!json) {
      process.stderr.write('.');
    }
    await sleep(pollIntervalMs);
  }

  throw new Error(`Timed out waiting for job ${jobId} to complete`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
