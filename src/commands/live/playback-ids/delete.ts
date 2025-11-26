import { Command } from "@cliffy/command";
import { Confirm } from "@cliffy/prompt";
import { createAuthenticatedMuxClient } from "../../../lib/mux.ts";
import { deleteLiveStreamPlaybackId } from "../../../lib/playback-ids.ts";

interface DeleteOptions {
	force?: boolean;
	json?: boolean;
}

export const deleteCommand = new Command()
	.description("Delete a playback ID from a live stream")
	.arguments("<live-stream-id:string> <playback-id:string>")
	.option("-f, --force", "Skip confirmation prompt")
	.option("--json", "Output JSON instead of pretty format")
	.action(
		async (
			options: DeleteOptions,
			liveStreamId: string,
			playbackId: string,
		) => {
			try {
				const mux = await createAuthenticatedMuxClient();

				if (!options.force) {
					if (options.json) {
						throw new Error(
							"Deletion requires --force flag when using --json output",
						);
					}

					const confirmed = await Confirm.prompt({
						message: `Are you sure you want to delete playback ID ${playbackId}?`,
						default: false,
					});

					if (!confirmed) {
						console.log("Deletion cancelled.");
						return;
					}
				}

				await deleteLiveStreamPlaybackId(mux, liveStreamId, playbackId);

				if (options.json) {
					console.log(
						JSON.stringify(
							{ success: true, liveStreamId, playbackId },
							null,
							2,
						),
					);
				} else {
					console.log(`Playback ID ${playbackId} deleted successfully`);
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
