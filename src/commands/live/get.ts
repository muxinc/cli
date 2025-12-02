import { Command } from "@cliffy/command";
import { formatLiveStream } from "../../lib/formatters.ts";
import { createAuthenticatedMuxClient } from "../../lib/mux.ts";

interface GetOptions {
	json?: boolean;
}

export const getCommand = new Command()
	.description("Get details about a specific Mux live stream")
	.arguments("<stream-id:string>")
	.option("--json", "Output JSON instead of pretty format")
	.action(async (options: GetOptions, streamId: string) => {
		try {
			// Initialize authenticated Mux client
			const mux = await createAuthenticatedMuxClient();

			// Fetch live stream details
			const stream = await mux.video.liveStreams.retrieve(streamId);

			if (options.json) {
				console.log(JSON.stringify(stream, null, 2));
			} else {
				formatLiveStream(stream);
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
