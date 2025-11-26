import { Command } from "@cliffy/command";
import { readConfig } from "../../lib/config.ts";
import { createAuthenticatedMuxClient } from "../../lib/mux.ts";

interface GetOptions {
	json?: boolean;
}

export const getCommand = new Command()
	.description("Get details about a specific signing key")
	.arguments("<signing-key-id:string>")
	.option("--json", "Output JSON instead of pretty format")
	.action(async (options: GetOptions, signingKeyId: string) => {
		try {
			// Initialize authenticated Mux client
			const mux = await createAuthenticatedMuxClient();

			// Fetch signing key details from API
			const signingKey = await mux.system.signingKeys.retrieve(signingKeyId);

			// Read local config to see if this key is configured in any environment
			const config = await readConfig();
			const activeEnvironments: string[] = [];

			if (config) {
				for (const [envName, env] of Object.entries(config.environments)) {
					if (env.signingKeyId === signingKeyId) {
						activeEnvironments.push(envName);
					}
				}
			}

			if (options.json) {
				console.log(
					JSON.stringify(
						{
							id: signingKey.id,
							created_at: signingKey.created_at,
							active_in_environments: activeEnvironments,
						},
						null,
						2,
					),
				);
			} else {
				console.log(`Signing Key: ${signingKey.id}`);
				console.log(`Created: ${signingKey.created_at}`);
				if (activeEnvironments.length > 0) {
					console.log(
						`Status: Active in environment${activeEnvironments.length > 1 ? "s" : ""} '${activeEnvironments.join("', '")}'`,
					);
				} else {
					console.log("Status: Not configured in any local environment");
				}
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
