import { Command } from '@cliffy/command';
import { askQuestionsCommand } from './ask-questions.ts';
import { cancelCommand } from './cancel.ts';
import { editCaptionsCommand } from './edit-captions.ts';
import { findBestThumbnailsCommand } from './find-best-thumbnails.ts';
import { findKeyMomentsCommand } from './find-key-moments.ts';
import { findScenesCommand } from './find-scenes.ts';
import { generateChaptersCommand } from './generate-chapters.ts';
import { generateEngagementInsightsCommand } from './generate-engagement-insights.ts';
import { generatePremiumCaptionsCommand } from './generate-premium-captions.ts';
import { getCommand } from './get.ts';
import { listCommand } from './list.ts';
import { moderateCommand } from './moderate.ts';
import { summarizeCommand } from './summarize.ts';
import { translateAudioCommand } from './translate-audio.ts';
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
  .command('translate-captions', translateCaptionsCommand)
  .command('edit-captions', editCaptionsCommand)
  .command('find-best-thumbnails', findBestThumbnailsCommand)
  .command('find-scenes', findScenesCommand)
  .command('generate-engagement-insights', generateEngagementInsightsCommand)
  .command('generate-premium-captions', generatePremiumCaptionsCommand)
  .command('translate-audio', translateAudioCommand);
