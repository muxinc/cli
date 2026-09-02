import { Command } from '@cliffy/command';
import { type CredentialKind, readConfig } from '@/lib/config.ts';
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

/** Width of the label column, matching the `Label:  value` style of whoami. */
const LABEL_WIDTH = 14;

/** One aligned `Label:  value` line. An empty label indents a continuation. */
function field(label: string, value: string): string {
  const prefix = label ? `${label}:` : '';
  return `${prefix.padEnd(LABEL_WIDTH)}${value}`;
}

/**
 * How a credential is described to a person. "oauth" and "token" are the
 * internal kinds; neither means much to a reader, and an environment reachable
 * both ways needs to say which one is actually used.
 */
function describeKinds(kinds: CredentialKind[]): string {
  const names: Record<CredentialKind, string> = {
    oauth: 'browser sign-in',
    token: 'access token',
  };

  if (kinds.length === 0) return 'no credentials';
  if (kinds.length === 1) return names[kinds[0]];
  return `${names[kinds[0]]} (also has ${names[kinds[1]]})`;
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
        return {
          name,
          ...summary,
          // Epoch, not prose: JSON consumers can compare it, and the human
          // output deliberately says nothing about expiry (the CLI refreshes on
          // its own, so it is not something to act on).
          expiresAt: config?.environments[name].oauth?.expiresAt ?? null,
          selected: name === activeStored,
        };
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
                expires_at: entry.expiresAt,
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

      const active = entries.find((entry) => entry.selected);

      // Aligned label/value, matching `mux whoami`. The active credential is
      // described in full; anything else is a one-line list. No marker legend —
      // "Active" says which one it is.
      if (envVarsActive) {
        console.log(field('Active', 'MUX_TOKEN_ID / MUX_TOKEN_SECRET'));
        console.log(field('Source', 'environment variables'));
        if (activeStored) {
          console.log(
            field(
              'Note',
              `takes precedence over the saved login ${activeStored}`,
            ),
          );
          console.log(field('', 'unset both variables to use that instead'));
        }
      } else if (active) {
        console.log(field('Active', active.name));
        console.log(field('Sign-in', describeKinds(active.kinds)));
        if (active.identity) {
          console.log(field('Environment', active.identity));
        }
        if (active.warning) {
          console.log(field('Warning', active.warning));
        }
      }

      // When environment variables are in charge, no stored login is active, so
      // every one of them is listed — including the selected one, which is what
      // would take over if the variables were unset.
      const listed = envVarsActive
        ? entries
        : entries.filter((entry) => !entry.selected);

      if (listed.length > 0) {
        console.log(
          `\n${envVarsActive ? 'Saved logins' : 'Other environments'} (${listed.length}):`,
        );
        const nameWidth = Math.max(...listed.map((entry) => entry.name.length));
        const kindWidth = Math.max(
          ...listed.map((entry) => describeKinds(entry.kinds).length),
        );
        for (const entry of listed) {
          const suffix = envVarsActive && entry.selected ? '  (selected)' : '';
          const detail = [
            describeKinds(entry.kinds).padEnd(kindWidth),
            entry.identity,
          ]
            .filter(Boolean)
            .join('  ');
          console.log(
            `  ${entry.name.padEnd(nameWidth)}  ${detail}${suffix}`.trimEnd(),
          );
          if (entry.warning) {
            console.log(`  ${' '.repeat(nameWidth)}  ${entry.warning}`);
          }
        }
        console.log("\nSwitch with 'mux env switch <name>'.");
      }
    } catch (error) {
      await handleCommandError(error, 'auth', 'status', options);
    }
  });
