import { Command } from '@cliffy/command';
import { loadDocsIndex, searchDocsIndex } from '@/lib/docs.ts';

interface SearchOptions {
  json?: boolean;
  limit?: number;
  source?: string;
}

export const searchCommand = new Command()
  .description('Search Mux docs')
  .arguments('<query:string>')
  .option('--json', 'Output JSON instead of pretty format')
  .option('--limit <number:number>', 'Number of results to return', {
    default: 10,
  })
  .option('--source <path:string>', 'Path to a local mux.com docs repository')
  .action(async (options: SearchOptions, query: string) => {
    try {
      const { index, source } = await loadDocsIndex({
        explicitPath: options.source,
      });
      const results = searchDocsIndex(index, query, { limit: options.limit });

      if (options.json) {
        console.log(
          JSON.stringify(
            {
              query,
              source,
              results: results.map((result) => ({
                score: result.score,
                snippet: result.snippet,
                doc: {
                  id: result.entry.id,
                  title: result.entry.title,
                  description: result.entry.description,
                  product: result.entry.product,
                  route: result.entry.route,
                  url: result.entry.url,
                  relativePath: result.entry.relativePath,
                  headings: result.entry.headings,
                },
              })),
            },
            null,
            2,
          ),
        );
        return;
      }

      if (results.length === 0) {
        console.log('No docs found.');
        return;
      }

      for (const result of results) {
        console.log(`${result.entry.title} (${result.entry.id})`);
        console.log(`  ${result.entry.url}`);
        if (result.entry.description) {
          console.log(`  ${result.entry.description}`);
        } else {
          console.log(`  ${result.snippet}`);
        }
        console.log('');
      }
    } catch (error) {
      printDocsError(error, options);
    }
  });

function printDocsError(error: unknown, options: SearchOptions): never {
  const message = error instanceof Error ? error.message : String(error);

  if (options.json) {
    console.error(JSON.stringify({ error: message }, null, 2));
  } else {
    console.error(`Error: ${message}`);
  }

  process.exit(1);
}
