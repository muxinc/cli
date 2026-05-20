import { Command } from '@cliffy/command';
import {
  findDocById,
  formatDocContent,
  loadDocsIndex,
  readDocContent,
} from '@/lib/docs.ts';

interface ReadOptions {
  format?: 'markdown' | 'raw';
  json?: boolean;
  source?: string;
}

export const readCommand = new Command()
  .description('Read a Mux docs page')
  .arguments('<doc-id:string>')
  .option('--format <format:string>', 'Output format: markdown or raw', {
    default: 'markdown',
    value: (value: string): 'markdown' | 'raw' => {
      if (value !== 'markdown' && value !== 'raw') {
        throw new Error('Invalid format. Must be "markdown" or "raw".');
      }
      return value;
    },
  })
  .option('--json', 'Output JSON instead of pretty format')
  .option('--source <path:string>', 'Path to a local mux.com docs repository')
  .action(async (options: ReadOptions, docId: string) => {
    try {
      const { index, source } = await loadDocsIndex({
        explicitPath: options.source,
      });
      const doc = findDocById(index, docId);

      if (!doc) {
        throw new Error(`Docs page not found: ${docId}`);
      }

      const content = formatDocContent(
        await readDocContent(doc),
        options.format,
      );

      if (options.json) {
        console.log(
          JSON.stringify(
            {
              source,
              doc,
              content,
            },
            null,
            2,
          ),
        );
        return;
      }

      console.log(content);
    } catch (error) {
      printDocsError(error, options);
    }
  });

function printDocsError(error: unknown, options: ReadOptions): never {
  const message = error instanceof Error ? error.message : String(error);

  if (options.json) {
    console.error(JSON.stringify({ error: message }, null, 2));
  } else {
    console.error(`Error: ${message}`);
  }

  process.exit(1);
}
