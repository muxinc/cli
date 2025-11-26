import { Command } from "@cliffy/command";
import { Confirm } from "@cliffy/prompt";
import { getDefaultEnvironment, setEnvironment } from "../../lib/config.ts";
import { createAuthenticatedMuxClient } from "../../lib/mux.ts";

interface CreateOptions {
	json?: boolean;
}

export const createCommand = new Command()
	.description(
		"Create a new signing key and save it to the current environment",
	)
	.option("--json", "Output JSON instead of pretty format")
	.action(async (options: CreateOptions) => {
		try {
			// Initialize authenticated Mux client
			const mux = await createAuthenticatedMuxClient();

			// Get current environment
			const currentEnv = await getDefaultEnvironment();
			if (!currentEnv) {
				throw new Error(
					"No environment configured. Please run 'mux login' first.",
				);
			}

			// Check if a signing key already exists
			if (currentEnv.environment.signingKeyId && !options.json) {
				const confirmed = await Confirm.prompt({
					message: `Environment '${currentEnv.name}' already has a signing key (${currentEnv.environment.signingKeyId}). Replace it?`,
					default: false,
				});

				if (!confirmed) {
					console.log("Operation cancelled.");
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

			// Store the signing key in the current environment config
			// Wrap in try-catch to prevent privateKey from leaking in error messages
			try {
				await setEnvironment(currentEnv.name, {
					...currentEnv.environment,
					signingKeyId: keyId,
					signingPrivateKey: privateKey,
				});
			} catch (err) {
				throw new Error(
					`Failed to save signing key to config: ${err instanceof Error ? err.message : "Unknown error"}`,
				);
			}

			if (options.json) {
				console.log(
					JSON.stringify(
						{
							id: keyId,
							created_at: createdAt,
							environment: currentEnv.name,
						},
						null,
						2,
					),
				);
			} else {
				console.log(
					`Signing key created and saved to environment: ${currentEnv.name}`,
				);
				console.log(`Key ID: ${keyId}`);
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);

			if (options.json) {
				console.error(JSON.stringify({ error: errorMessage }, null, 2));
			} else {
				console.error(`Error: ${errorMessage}`);
			}
			process.exit(1);
		}
	});
