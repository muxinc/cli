import { Command } from '@cliffy/command';
import type {
  AskQuestionCreateParams,
  AskQuestionsJobParameters,
} from '@mux/mux-node/resources/robots-preview/jobs';
import { handleCommandError } from '@/lib/errors.ts';
import { createAuthenticatedMuxClient } from '@/lib/mux.ts';
import {
  FILE_MUTEX_MSG,
  loadJobParameters,
  pollForRobotsJob,
} from './_shared.ts';

interface AskQuestionsOptions {
  question?: string[];
  languageCode?: string;
  passthrough?: string;
  file?: string;
  wait?: boolean;
  json?: boolean;
}

export function parseQuestion(raw: string): AskQuestionsJobParameters.Question {
  const pipeIdx = raw.indexOf('|');
  if (pipeIdx === -1) {
    const question = raw.trim();
    if (!question) {
      throw new Error('question text cannot be empty');
    }
    return { question };
  }

  const question = raw.slice(0, pipeIdx).trim();
  if (!question) {
    throw new Error('question text cannot be empty');
  }

  const answer_options = raw
    .slice(pipeIdx + 1)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (answer_options.length === 0) {
    throw new Error(
      'answer_options cannot be empty after "|". Use "question?|opt1,opt2" or drop the pipe for yes/no.',
    );
  }

  return { question, answer_options };
}

// biome-ignore lint/suspicious/noExplicitAny: Cliffy's chained types are too complex for TS to infer
export const askQuestionsCommand: Command<any> = new Command()
  .description('Create a job to ask questions about a video and get answers')
  .arguments('<asset-id:string>')
  .option(
    '--question <question:string>',
    'Question to ask. Format: "text" or "text|opt1,opt2,opt3" for custom answers (defaults to yes/no). Can be specified multiple times.',
    { collect: true },
  )
  .option(
    '--language-code <languageCode:string>',
    'BCP 47 language code of the caption track to analyze',
  )
  .option(
    '--passthrough <passthrough:string>',
    'Arbitrary metadata returned in API responses (max 255 chars)',
  )
  .option(
    '-f, --file <path:string>',
    'JSON config file with the full parameters object (questions, language_code, etc.)',
  )
  .option(
    '--wait',
    'Wait for the job to reach a terminal status (polls up to 15 minutes)',
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: AskQuestionsOptions, assetId: string) => {
    try {
      const hasShapeFlags =
        (options.question && options.question.length > 0) ||
        options.languageCode !== undefined;

      if (options.file && hasShapeFlags) {
        throw new Error(FILE_MUTEX_MSG);
      }

      if (
        !options.file &&
        (!options.question || options.question.length === 0)
      ) {
        throw new Error(
          'Must provide at least one --question, or a --file with questions.',
        );
      }

      let parameters: AskQuestionsJobParameters;
      if (options.file) {
        parameters = await loadJobParameters<AskQuestionsJobParameters>(
          options.file,
          assetId,
        );
      } else {
        parameters = {
          asset_id: assetId,
          questions: (options.question ?? []).map(parseQuestion),
        };
        if (options.languageCode !== undefined) {
          parameters.language_code = options.languageCode;
        }
      }

      const body: AskQuestionCreateParams = { parameters };
      if (options.passthrough !== undefined)
        body.passthrough = options.passthrough;

      const mux = await createAuthenticatedMuxClient();
      let job = await mux.robotsPreview.jobs.askQuestions.create(body);

      if (!options.json) {
        console.log('Ask questions job created');
        console.log(`  Job ID: ${job.id}`);
        console.log(`  Status: ${job.status}`);
      }

      if (options.wait) {
        job = (await pollForRobotsJob(
          mux,
          'ask-questions',
          job.id,
          Boolean(options.json),
        )) as typeof job;
      }

      if (options.json) {
        console.log(JSON.stringify(job, null, 2));
        return;
      }

      if (options.wait && job.outputs) {
        console.log('Outputs:');
        console.log(JSON.stringify(job.outputs, null, 2));
      }
    } catch (error) {
      await handleCommandError(error, 'robots', 'ask-questions', options);
    }
  });
