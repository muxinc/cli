import { Command } from '@cliffy/command';
import { handleCommandError } from '@/lib/errors.ts';
import {
  fetchDocsIndex,
  parseDocsIndex,
  searchDocsIndex,
} from '../../lib/docs-index.ts';

interface DocsFindOptions {
  json?: boolean;
  limit: number;
}

export const docsFindCommand = new Command()
  .description(
    'Search the live Mux docs index (mux.com/llms.txt) and print matching page URLs.\n\nSearches CLI-side so agents get page URLs without reading the index into context. Fetch the returned URL for the page content; no docs are stored locally.',
  )
  .arguments('<query...:string>')
  .option('--limit <n:number>', 'Maximum number of results', { default: 5 })
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: DocsFindOptions, ...query: string[]) => {
    try {
      const text = await fetchDocsIndex();
      const entries = parseDocsIndex(text);
      const results = searchDocsIndex(entries, query.join(' '), options.limit);

      if (options.json) {
        console.log(
          JSON.stringify({ query: query.join(' '), results }, null, 2),
        );
        return;
      }

      if (results.length === 0) {
        console.log(
          'No matching docs pages. Try different terms, or browse https://www.mux.com/llms.txt',
        );
        return;
      }

      for (const result of results) {
        console.log(result.url);
        if (result.description) {
          console.log(`  ${result.description}`);
        }
      }
    } catch (error) {
      await handleCommandError(error, 'docs', 'find', options);
    }
  });
