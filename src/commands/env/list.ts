import { Command } from '@cliffy/command';
import { readConfig } from '@/lib/config.ts';
import { wantsJson } from '@/lib/context.ts';
import { summarizeEnvironment } from '@/lib/credentials.ts';

interface ListOptions {
  json?: boolean;
}

export const listCommand = new Command()
  .description('List all configured environments')
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: ListOptions) => {
    const config = await readConfig();
    const json = wantsJson(options);

    if (!config || Object.keys(config.environments).length === 0) {
      if (json) {
        console.log(
          JSON.stringify({ environments: [], current: null }, null, 2),
        );
        return;
      }
      console.log('No environments configured.');
      console.log("\nRun 'mux login' to add an environment.");
      return;
    }

    const envNames = Object.keys(config.environments);
    const currentEnv = config.defaultEnvironment;

    if (json) {
      console.log(
        JSON.stringify(
          {
            environments: envNames.map((name) => {
              const environment = config.environments[name];
              const summary = summarizeEnvironment(environment);
              return {
                name,
                // Every credential the entry holds, preferred first, since an
                // environment can be reachable more than one way.
                auth: summary.kinds,
                preferred: summary.preferred,
                environment_id: environment.environmentId ?? null,
                organization_name: environment.organizationName ?? null,
                environment_name: environment.environmentName ?? null,
                expires_at: environment.oauth?.expiresAt ?? null,
                warning: summary.warning ?? null,
                current: name === currentEnv,
              };
            }),
            current: currentEnv ?? null,
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log('Configured environments:\n');

    const labels = new Map(
      envNames.map((name) => [
        name,
        `${name}${name === currentEnv ? ' (current)' : ''}`,
      ]),
    );
    const labelWidth = Math.max(
      ...[...labels.values()].map((label) => label.length),
    );
    const summaries = new Map(
      envNames.map((name) => [
        name,
        summarizeEnvironment(config.environments[name]),
      ]),
    );
    const authWidth = Math.max(
      ...[...summaries.values()].map((s) => s.kinds.join('+').length),
    );

    for (const name of envNames) {
      const summary = summaries.get(name) as ReturnType<
        typeof summarizeEnvironment
      >;
      const marker = name === currentEnv ? '* ' : '  ';
      // "oauth+token" when an environment holds both; the first is preferred.
      const auth = (summary.kinds.join('+') || 'none').padEnd(authWidth);
      // No expiry column: the CLI refreshes on its own, so it is not something
      // a reader can act on. `--json` still carries expires_at.
      const details = summary.identity;
      console.log(
        `${marker}${(labels.get(name) as string).padEnd(labelWidth)}  ${auth}  ${details}`.trimEnd(),
      );
      if (summary.warning) {
        console.log(`${' '.repeat(2 + labelWidth)}  ⚠ ${summary.warning}`);
      }
    }

    console.log(
      `\n${envNames.length} environment${envNames.length === 1 ? '' : 's'} total`,
    );

    // A forgotten shell variable outranks whatever is marked current here, so
    // say so rather than letting the asterisk mislead.
    if (process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET) {
      console.log(
        "\nNote: MUX_TOKEN_ID/MUX_TOKEN_SECRET are set and take precedence over the selection above. Run 'mux auth status' for details.",
      );
    }
  });
