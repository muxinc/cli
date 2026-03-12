import { Command } from '@cliffy/command';
import { resolveEmbeddedDocsPaths } from '../../lib/embedded-docs.ts';

interface DocsPathOptions {
  json?: boolean;
}

export const pathCommand = new Command()
  .description('Print the installed paths to the embedded skill and bundled docs')
  .option('--json', 'Output JSON instead of pretty format')
  .action((options: DocsPathOptions) => {
    const paths = resolveEmbeddedDocsPaths();

    if (!paths) {
      const errorMessage =
        'Could not find embedded docs for this Mux CLI install.';

      if (options.json) {
        console.error(JSON.stringify({ error: errorMessage }, null, 2));
      } else {
        console.error(`Error: ${errorMessage}`);
      }

      process.exit(1);
    }

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            root_path: paths.rootPath,
            skill_path: paths.skillPath,
            docs_path: paths.docsPath,
            agents_path: paths.agentsPath,
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log(`Root:    ${paths.rootPath}`);
    console.log(`Skill:   ${paths.skillPath}`);
    console.log(`Docs:    ${paths.docsPath}`);
    console.log(`AGENTS:  ${paths.agentsPath ?? 'not installed'}`);
  });
