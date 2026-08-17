import { Command } from '@cliffy/command';
import { readConfig } from '@/lib/config.ts';
import { wantsJson } from '@/lib/context.ts';
import { summarizeEnvironment } from '@/lib/credentials.ts';
import { handleCommandError } from '@/lib/errors.ts';
import { getConfigPath } from '@/lib/xdg.ts';

/**
 * `mux auth status` — every credential source the CLI can see, which one is
 * active, and why. Reads only local state: no network call, no token material in
 * the output.
 */

interface StatusOptions {
  json?: boolean;
}

export const statusCommand = new Command()
  .description(
    'Show every available credential source, which one is active, and how to switch',
  )
  .option('--json', 'Output JSON instead of pretty format')
  .action(async (options: StatusOptions) => {
    try {
      const json = wantsJson(options);
      const config = await readConfig();
      const names = config ? Object.keys(config.environments) : [];
      const selected = config?.defaultEnvironment;

      const envTokenId = process.env.MUX_TOKEN_ID;
      const envTokenSecret = process.env.MUX_TOKEN_SECRET;
      const envVarsActive = Boolean(envTokenId && envTokenSecret);

      // The selected entry only governs when environment variables are absent;
      // this mirrors the resolution order in lib/mux.ts.
      const activeStored =
        selected && config?.environments[selected] ? selected : names[0];

      const entries = names.map((name) => {
        const summary = summarizeEnvironment(
          // biome-ignore lint/style/noNonNullAssertion: name came from this map
          config!.environments[name],
        );
        return { name, ...summary, selected: name === activeStored };
      });

      if (json) {
        console.log(
          JSON.stringify(
            {
              active: envVarsActive
                ? {
                    source: 'env',
                    type: 'token',
                    ...(activeStored && { shadows: activeStored }),
                  }
                : activeStored
                  ? {
                      source: 'config',
                      environment: activeStored,
                      type: entries.find((e) => e.selected)?.preferred,
                    }
                  : { source: 'none' },
              environments: entries.map((entry) => ({
                name: entry.name,
                auth: entry.kinds,
                preferred: entry.preferred,
                identity: entry.identity || null,
                expiry: entry.expiry ?? null,
                warning: entry.warning ?? null,
                selected: entry.selected,
              })),
              config_path: getConfigPath(),
            },
            null,
            2,
          ),
        );
        return;
      }

      if (!envVarsActive && entries.length === 0) {
        console.log('Not signed in, and no credentials found.');
        console.log(
          "\nRun 'mux login' to sign in, or set MUX_TOKEN_ID and MUX_TOKEN_SECRET.",
        );
        return;
      }

      if (envVarsActive) {
        console.log(
          'Active: MUX_TOKEN_ID / MUX_TOKEN_SECRET (environment variables)',
        );
        if (activeStored) {
          console.log(
            `  Environment variables take precedence over the stored login "${activeStored}".`,
          );
          console.log('  Unset them to use the stored selection below.');
        }
      } else if (activeStored) {
        const active = entries.find((entry) => entry.selected);
        console.log(
          `Active: stored login "${activeStored}"${
            active?.preferred ? ` (${active.preferred})` : ''
          }`,
        );
        if (active?.identity) {
          console.log(`  ${active.identity}`);
        }
      }

      if (entries.length === 0) {
        console.log("\nNo stored logins. Run 'mux login' to add one.");
        return;
      }

      console.log(
        `\nStored logins (${entries.length}):${envVarsActive ? ' currently shadowed' : ''}`,
      );
      const nameWidth = Math.max(...entries.map((entry) => entry.name.length));
      const authWidth = Math.max(
        ...entries.map((entry) => entry.kinds.join('+').length),
      );
      for (const entry of entries) {
        const marker = entry.selected ? '*' : ' ';
        // "oauth+token" when an environment is reachable both ways; the first
        // listed is the one requests will use.
        const auth = (entry.kinds.join('+') || 'none').padEnd(authWidth);
        const details = [entry.identity, entry.expiry]
          .filter(Boolean)
          .join('   ');
        console.log(
          `${marker} ${entry.name.padEnd(nameWidth)}  ${auth}  ${details}`.trimEnd(),
        );
        if (entry.warning) {
          console.log(`${' '.repeat(nameWidth + 2)}  ⚠ ${entry.warning}`);
        }
      }

      console.log(
        "\n* = selected stored environment. Change it with 'mux env switch <name>'.",
      );
      if (entries.some((entry) => entry.kinds.length > 1)) {
        console.log(
          'Environments listing two credentials are reachable both ways; the first is preferred.',
        );
      }
    } catch (error) {
      await handleCommandError(error, 'auth', 'status', options);
    }
  });
