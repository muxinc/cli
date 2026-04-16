import { Command } from '@cliffy/command';
import { askQuestionsCommand } from './ask-questions.ts';
import { cancelCommand } from './cancel.ts';
import { findKeyMomentsCommand } from './find-key-moments.ts';
import { generateChaptersCommand } from './generate-chapters.ts';
import { getCommand } from './get.ts';
import { listCommand } from './list.ts';
import { moderateCommand } from './moderate.ts';
import { summarizeCommand } from './summarize.ts';
import { translateCaptionsCommand } from './translate-captions.ts';

// biome-ignore lint/suspicious/noExplicitAny: Cliffy's chained types are too complex for TS to infer
export const robotsCommand: Command<any> = new Command()
  .description('Run AI-powered workflows on your video assets using Mux Robots')
  .action(function () {
    this.showHelp();
  })
  .command('list', listCommand)
  .command('get', getCommand)
  .command('cancel', cancelCommand)
  .command('summarize', summarizeCommand)
  .command('moderate', moderateCommand)
  .command('generate-chapters', generateChaptersCommand)
  .command('ask-questions', askQuestionsCommand)
  .command('find-key-moments', findKeyMomentsCommand)
  .command('translate-captions', translateCaptionsCommand);
