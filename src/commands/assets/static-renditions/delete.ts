import { Command } from "@cliffy/command";
import { Confirm } from "@cliffy/prompt";
import { createAuthenticatedMuxClient } from "../../../lib/mux.ts";

interface DeleteOptions {
	force?: boolean;
	json?: boolean;
}

export const deleteCommand = new Command()
	.description("Delete a static rendition from an asset")
	.arguments("<asset-id:string> <rendition-id:string>")
	.option("-f, --force", "Skip confirmation prompt")
	.option("--json", "Output JSON instead of pretty format")
	.action(
		async (options: DeleteOptions, assetId: string, renditionId: string) => {
			try {
				const mux = await createAuthenticatedMuxClient();

				if (!options.force) {
					if (options.json) {
						throw new Error(
							"Deletion requires --force flag when using --json output",
						);
					}

					const confirmed = await Confirm.prompt({
						message: `Are you sure you want to delete static rendition ${renditionId}?`,
						default: false,
					});

					if (!confirmed) {
						console.log("Deletion cancelled.");
						return;
					}
				}

				await mux.video.assets.deleteStaticRendition(assetId, renditionId);

				if (options.json) {
					console.log(
						JSON.stringify(
							{
								success: true,
								message: `Static rendition ${renditionId} deleted from asset ${assetId}`,
							},
							null,
							2,
						),
					);
				} else {
					console.log(
						`Static rendition ${renditionId} deleted from asset ${assetId}`,
					);
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
		},
	);
