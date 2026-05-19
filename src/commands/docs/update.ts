import { Command } from '@cliffy/command';
import {
  buildDocsIndex,
  resolveDocsSource,
  updatePublishedDocsCache,
  writeDocsIndexCache,
} from '@/lib/docs.ts';

interface UpdateOptions {
  source?: string;
  artifactPath?: string;
  manifestUrl?: string;
  indexUrl?: string;
  force?: boolean;
  json?: boolean;
}

interface UpdateOutput {
  source: string;
  indexedDocuments: number;
  generatedAt: string;
  version?: string;
}

export const updateCommand = new Command()
  .description('Update or refresh the local Mux docs cache')
  .option('--source <path:string>', 'Path to a local mux.com docs repository')
  .option(
    '--artifact-path <path:string>',
    'Path to local generated mux docs artifacts (manifest.json and index.json)',
  )
  .option('--manifest-url <url:string>', 'URL for the published docs manifest')
  .option('--index-url <url:string>', 'URL for the published docs index')
  .option('--force', 'Refresh cached docs artifacts')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: UpdateOptions) => {
    try {
      const output = options.source
        ? await updateFromLocalSource(options.source)
        : await updateFromPublishedArtifacts(options);

      if (options.json) {
        console.log(JSON.stringify(output, null, 2));
        return;
      }

      console.log(
        `Updated Mux docs index with ${output.indexedDocuments} document(s).`,
      );
      console.log(`Source: ${output.source}`);
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

async function updateFromLocalSource(
  sourcePath: string,
): Promise<UpdateOutput> {
  const source = await resolveDocsSource({ explicitPath: sourcePath });
  const index = await buildDocsIndex({
    repoPath: source.repoPath,
    repoUrl: source.repoUrl,
  });
  await writeDocsIndexCache(index);

  return {
    source: source.repoPath,
    indexedDocuments: index.entries.length,
    generatedAt: index.generatedAt,
    version: index.version,
  };
}

async function updateFromPublishedArtifacts(
  options: UpdateOptions,
): Promise<UpdateOutput> {
  const { manifest, index } = await updatePublishedDocsCache({
    artifactPath: options.artifactPath,
    manifestUrl: options.manifestUrl,
    indexUrl: options.indexUrl,
  });

  return {
    source:
      options.artifactPath ??
      process.env.MUX_DOCS_ARTIFACT_PATH ??
      manifest.indexUrl,
    indexedDocuments: index.entries.length,
    generatedAt: index.generatedAt,
    version: manifest.version,
  };
}
