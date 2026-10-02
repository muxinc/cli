import { Command } from '@cliffy/command';
import { updateEnvironment } from '@/lib/config.ts';
import { wantsJson } from '@/lib/context.ts';
import {
  assertEnvFileWritable,
  isGitIgnored,
  type WriteEnvVarsResult,
  writeEnvVars,
} from '@/lib/env-file.ts';
import { handleCommandError } from '@/lib/errors.ts';
import {
  createAuthenticatedMuxClient,
  resolveActiveEnvironment,
} from '@/lib/mux.ts';
import { confirmPrompt } from '@/lib/prompt.ts';

interface CreateOptions {
  json?: boolean;
  force?: boolean;
  envFile?: string;
}

const NOT_SAVED_NOTE =
  'No stored environment matches the active credentials, so the private key was not saved. Set MUX_SIGNING_KEY and MUX_PRIVATE_KEY to sign URLs with it.';

const ENV_FILE_NOT_SAVED_NOTE =
  'No stored environment matches the active credentials, so the key was written only to the env file, not to the CLI config. `mux sign` uses it only when MUX_SIGNING_KEY and MUX_PRIVATE_KEY are set in the shell.';

const ENV_FILE_SAVE_FAILED_NOTE =
  'Saving to the environment config failed, so the key was written only to the env file. `mux sign` uses it only when MUX_SIGNING_KEY and MUX_PRIVATE_KEY are set in the shell.';

const SAVE_FAILED_NOTE =
  'Saving to the environment config failed, so the private key is shown here instead — this is the only time it is available. Set MUX_SIGNING_KEY and MUX_PRIVATE_KEY to sign URLs with it.';

export const createCommand = new Command()
  .description(
    'Create a signing key and save to current environment (private key only available at creation)',
  )
  .option('--json', 'Output JSON instead of pretty format')
  .option('-f, --force', 'Replace an existing signing key without confirmation')
  .option(
    '--env-file <path:string>',
    'Also write the key to a project env file as MUX_SIGNING_KEY and MUX_PRIVATE_KEY (created if missing; other lines are kept). The private key is never printed.',
  )
  .action(async (options: CreateOptions) => {
    try {
      // Checked before the key exists: once created, the private key cannot
      // be fetched again, so an unwritable path must not be discovered after.
      if (options.envFile) {
        await assertEnvFileWritable(options.envFile);
      }

      // Initialize authenticated Mux client
      const mux = await createAuthenticatedMuxClient();

      // The key is only saved when the stored environment matches the active
      // credentials; otherwise it would desync from the environment the key
      // was actually created in.
      const active = await resolveActiveEnvironment();
      const target = active.stored;

      // Replacing an existing key is destructive: the saved private key is
      // overwritten and cannot be retrieved again. Confirm unless --force.
      if (target?.environment.signingKeyId && !options.force) {
        if (wantsJson(options)) {
          throw new Error(
            `Environment '${target.name}' already has a signing key (${target.environment.signingKeyId}). Replacing it requires the --force flag with --json or in agent mode.`,
          );
        }

        const confirmed = await confirmPrompt({
          message: `Environment '${target.name}' already has a signing key (${target.environment.signingKeyId}). Replace it?`,
          default: false,
        });

        if (!confirmed) {
          console.log('Operation cancelled.');
          return;
        }
      }
      // Create signing key via Mux API
      const signingKey = await mux.system.signingKeys.create();

      // Immediately extract key data and drop reference to full object
      // This prevents the private key from leaking in error messages
      const keyId = signingKey.id;
      const privateKey = signingKey.private_key;
      const createdAt = signingKey.created_at;

      let saveFailed = false;
      let savedToConfig = false;
      if (target) {
        // Persist only the two signing fields. updateEnvironment re-reads
        // the config before merging, so fields another command wrote while
        // the API calls above were in flight (e.g. a forwardUrl saved by a
        // long-running `webhooks listen`) are not clobbered.
        try {
          await updateEnvironment(target.name, {
            signingKeyId: keyId,
            signingPrivateKey: privateKey,
          });
          savedToConfig = true;
        } catch (err) {
          // The key already exists server-side and the API only returns the
          // private key at creation time — swallowing it here would lose it
          // forever. Report the save failure on stderr and fall through to
          // the emit-once output below.
          console.error(
            `Failed to save signing key to config: ${err instanceof Error ? err.message : 'Unknown error'}`,
          );
          saveFailed = true;
        }
      }

      let envFileResult: WriteEnvVarsResult | undefined;
      if (options.envFile) {
        try {
          if (!privateKey) {
            throw new Error('the API response did not include a private key');
          }
          envFileResult = await writeEnvVars(options.envFile, {
            MUX_SIGNING_KEY: keyId,
            MUX_PRIVATE_KEY: privateKey,
          });
        } catch (err) {
          const reason = err instanceof Error ? err.message : 'Unknown error';
          if (savedToConfig && target) {
            // The key is safe in the CLI config, so this is a plain failure:
            // the private key stays out of the output.
            throw new Error(
              `Signing key ${keyId} was created and saved to environment '${target.name}', but writing ${options.envFile} failed: ${reason}`,
            );
          }
          // Nowhere else holds the private key: emit it once below.
          console.error(
            `Failed to write signing key to ${options.envFile}: ${reason}`,
          );
        }
      }

      if (envFileResult && options.envFile) {
        const gitignored = isGitIgnored(options.envFile);
        const warnings =
          gitignored === false
            ? [
                `${options.envFile} is not ignored by git. Add it to .gitignore so the private key is not committed.`,
              ]
            : [];
        const note = savedToConfig
          ? undefined
          : saveFailed
            ? ENV_FILE_SAVE_FAILED_NOTE
            : ENV_FILE_NOT_SAVED_NOTE;

        if (wantsJson(options)) {
          console.log(
            JSON.stringify(
              {
                id: keyId,
                created_at: createdAt,
                ...(savedToConfig && target && { environment: target.name }),
                saved: savedToConfig,
                env_file: {
                  path: options.envFile,
                  created: envFileResult.created,
                  updated: envFileResult.updated,
                  added: envFileResult.added,
                  gitignored,
                },
                ...(note && { note }),
                warnings,
              },
              null,
              2,
            ),
          );
        } else {
          if (savedToConfig && target) {
            console.log(
              `Signing key created and saved to environment: ${target.name}`,
            );
          } else {
            console.log('Signing key created');
          }
          console.log(`Key ID: ${keyId}`);
          console.log(
            `${envFileResult.created ? 'Created' : 'Updated'} ${options.envFile} with MUX_SIGNING_KEY and MUX_PRIVATE_KEY`,
          );
          if (note) {
            console.log();
            console.log(note);
          }
          for (const warning of warnings) {
            console.error(`⚠️  ${warning}`);
          }
        }
        return;
      }

      if (savedToConfig && target) {
        if (wantsJson(options)) {
          console.log(
            JSON.stringify(
              {
                id: keyId,
                created_at: createdAt,
                environment: target.name,
                saved: true,
              },
              null,
              2,
            ),
          );
        } else {
          console.log(
            `Signing key created and saved to environment: ${target.name}`,
          );
          console.log(`Key ID: ${keyId}`);
        }
        return;
      }

      // No matching stored environment (or the save failed): emit the
      // private key once instead of persisting it. The API only returns it
      // at creation time.
      const note = saveFailed ? SAVE_FAILED_NOTE : NOT_SAVED_NOTE;
      if (wantsJson(options)) {
        console.log(
          JSON.stringify(
            {
              id: keyId,
              created_at: createdAt,
              private_key: privateKey,
              saved: false,
              note,
            },
            null,
            2,
          ),
        );
      } else {
        console.log(`Signing key created: ${keyId}`);
        console.log('Private key (base64, shown once, not saved):');
        console.log(privateKey);
        console.log();
        console.log(note);
        console.log(`  export MUX_SIGNING_KEY=${keyId}`);
        console.log('  export MUX_PRIVATE_KEY=<private key above>');
      }
    } catch (error) {
      await handleCommandError(error, 'signing-keys', 'create', options);
    }
  });
