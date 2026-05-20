import { Command } from '@cliffy/command';
import {
  getCachedDocsSource,
  hasCachedDocsIndex,
  readCachedDocsIndex,
  resolveDocsSource,
} from '@/lib/docs.ts';

interface SourceOptions {
  json?: boolean;
}

export const sourceCommand = new Command()
  .description('Show the active Mux docs source')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: SourceOptions) => {
    try {
      if (!process.env.MUX_DOCS_PATH && hasCachedDocsIndex()) {
        const index = await readCachedDocsIndex();
        const source = getCachedDocsSource(index);

        if (options.json) {
          console.log(JSON.stringify(source, null, 2));
          return;
        }

        console.log(`Source: ${source.source}`);
        if (source.source === 'published') {
          console.log(`Index: ${source.indexPath}`);
          console.log(`Manifest: ${source.manifestPath}`);
        } else {
          console.log(`Repository: ${source.repoPath}`);
          console.log(`Docs root: ${source.docsRoot}`);
          console.log(`Remote: ${source.repoUrl}`);
        }
        console.log(`Documents: ${index.entries.length}`);
        return;
      }

      const source = await resolveDocsSource();

      if (options.json) {
        console.log(JSON.stringify(source, null, 2));
        return;
      }

      console.log(`Source: ${source.source}`);
      console.log(`Repository: ${source.repoPath}`);
      console.log(`Docs root: ${source.docsRoot}`);
      console.log(`Remote: ${source.repoUrl}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (options.json) {
        console.error(JSON.stringify({ error: message }, null, 2));
      } else {
        console.error(`Error: ${message}`);
      }
      process.exit(1);
    }
  });
