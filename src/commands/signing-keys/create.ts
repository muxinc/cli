import { Command } from '@cliffy/command';
import { updateEnvironment } from '@/lib/config.ts';
import { wantsJson } from '@/lib/context.ts';
import { handleCommandError } from '@/lib/errors.ts';
import {
  createAuthenticatedMuxClient,
  resolveActiveEnvironment,
} from '@/lib/mux.ts';
import { confirmPrompt } from '@/lib/prompt.ts';

interface CreateOptions {
  json?: boolean;
  force?: boolean;
}

const NOT_SAVED_NOTE =
  'No stored environment matches the active credentials, so the private key was not saved. Set MUX_SIGNING_KEY and MUX_PRIVATE_KEY to sign URLs with it.';

const SAVE_FAILED_NOTE =
  'Saving to the environment config failed, so the private key is shown here instead — this is the only time it is available. Set MUX_SIGNING_KEY and MUX_PRIVATE_KEY to sign URLs with it.';

export const createCommand = new Command()
  .description(
    'Create a signing key and save to current environment (private key only available at creation)',
  )
  .option('--json', 'Output JSON instead of pretty format')
  .option('-f, --force', 'Replace an existing signing key without confirmation')
  .action(async (options: CreateOptions) => {
    try {
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
