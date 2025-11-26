import { Command } from "@cliffy/command";
import { createCommand } from "./create.ts";
import { deleteCommand } from "./delete.ts";
import { getCommand } from "./get.ts";
import { listCommand } from "./list.ts";
import { playbackIdsCommand } from "./playback-ids/index.ts";

export const assetsCommand = new Command()
	.description("Manage Mux video assets")
	.action(function () {
		this.showHelp();
	})
	.command("create", createCommand)
	.command("list", listCommand)
	.command("get", getCommand)
	.command("delete", deleteCommand)
	.command("playback-ids", playbackIdsCommand);
